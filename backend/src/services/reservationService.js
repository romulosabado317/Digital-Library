const HOLD_PERIOD_HOURS = 48;
const ACTIVE_RESERVATION_STATUSES = ["WAITING", "AVAILABLE"];

export class ReservationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ReservationError";
    this.code = code;
    this.status = status;
  }
}

export async function promoteNextReservation(tx, {
  resourceId,
  copyId,
  now,
  actorUserId,
}) {
  const next = await tx.reservation.findFirst({
    where: { resourceId, status: "WAITING" },
    orderBy: [{ queuePosition: "asc" }, { reservedAt: "asc" }],
    select: { id: true, userId: true },
  });
  if (!next) return null;

  const expiresAt = new Date(now.getTime() + HOLD_PERIOD_HOURS * 60 * 60 * 1000);
  const claim = await tx.reservation.updateMany({
    where: { id: next.id, status: "WAITING" },
    data: { status: "AVAILABLE", physicalCopyId: copyId, expiresAt },
  });
  if (claim.count !== 1) {
    throw new ReservationError("RESERVATION_CONFLICT", "The reservation queue changed. Retry the operation.", 409);
  }

  const copyClaim = await tx.physicalCopy.updateMany({
    where: { id: copyId, copyStatus: "AVAILABLE" },
    data: { copyStatus: "RESERVED" },
  });
  if (copyClaim.count !== 1) {
    throw new ReservationError("INVENTORY_CONFLICT", "The copy could not be reserved for the next member.", 409);
  }

  await tx.notification.create({
    data: {
      userId: next.userId,
      title: "Reserved resource is ready",
      message: `Your reserved resource is ready for pickup until ${expiresAt.toISOString().slice(0, 10)}.`,
      notificationType: "RESERVATION_AVAILABLE",
    },
  });
  if (actorUserId) {
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "RESERVATION_AVAILABLE",
        entityType: "Reservation",
        entityId: next.id,
        metadata: { resourceId, copyId },
      },
    });
  }
  return { ...next, status: "AVAILABLE", physicalCopyId: copyId, expiresAt };
}

export async function createReservation(prisma, { memberId, resourceId, now = new Date() }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.user.findUnique({
        where: { id: memberId },
        select: { id: true, role: true, accountStatus: true },
      });
      if (!member || member.role !== "MEMBER") {
        throw new ReservationError("MEMBER_NOT_FOUND", "An active member account is required.", 404);
      }
      if (member.accountStatus !== "ACTIVE") {
        throw new ReservationError("MEMBER_INACTIVE", "This member account is not active.", 409);
      }

      const resource = await tx.resource.findFirst({
        where: { id: resourceId, status: "ACTIVE" },
        select: { id: true, resourceType: true },
      });
      if (!resource) {
        throw new ReservationError("RESOURCE_NOT_FOUND", "The requested resource was not found.", 404);
      }
      if (resource.resourceType === "DIGITAL_RESOURCE") {
        throw new ReservationError("RESOURCE_NOT_RESERVABLE", "Digital resources do not use physical reservation queues.", 409);
      }

      const availableCopies = await tx.physicalCopy.count({
        where: { resourceId, copyStatus: "AVAILABLE" },
      });
      if (availableCopies > 0) {
        throw new ReservationError("COPY_AVAILABLE", "A copy is available to borrow; a reservation is not needed.", 409);
      }

      const existing = await tx.reservation.findFirst({
        where: { userId: memberId, resourceId, status: { in: ACTIVE_RESERVATION_STATUSES } },
        select: { id: true },
      });
      if (existing) {
        throw new ReservationError("RESERVATION_EXISTS", "You already have an active reservation for this resource.", 409);
      }

      const lastInQueue = await tx.reservation.findFirst({
        where: { resourceId, status: { in: ACTIVE_RESERVATION_STATUSES } },
        orderBy: [{ queuePosition: "desc" }, { reservedAt: "desc" }],
        select: { queuePosition: true },
      });
      const reservation = await tx.reservation.create({
        data: {
          userId: memberId,
          resourceId,
          physicalCopyId: null,
          queuePosition: (lastInQueue?.queuePosition ?? 0) + 1,
          status: "WAITING",
          reservedAt: now,
          expiresAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: memberId,
          action: "RESERVATION_CREATED",
          entityType: "Reservation",
          entityId: reservation.id,
          metadata: { resourceId, queuePosition: reservation.queuePosition },
        },
      });
      return reservation;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034" || error?.code === "P2002") {
      throw new ReservationError(
        "RESERVATION_CONFLICT",
        "The reservation queue changed. Refresh and try again.",
        409,
      );
    }
    throw error;
  }
}

export async function cancelReservation(prisma, {
  reservationId,
  actorId,
  actorRole,
  now = new Date(),
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) {
        throw new ReservationError("RESERVATION_NOT_FOUND", "The reservation was not found.", 404);
      }
      if (actorRole === "MEMBER" && reservation.userId !== actorId) {
        throw new ReservationError("RESERVATION_FORBIDDEN", "You can only cancel your own reservation.", 403);
      }
      if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
        throw new ReservationError("RESERVATION_NOT_ACTIVE", "This reservation can no longer be cancelled.", 409);
      }

      const claim = await tx.reservation.updateMany({
        where: { id: reservationId, status: reservation.status },
        data: { status: "CANCELLED" },
      });
      if (claim.count !== 1) {
        throw new ReservationError("RESERVATION_NOT_ACTIVE", "This reservation changed before it could be cancelled.", 409);
      }

      if (reservation.status === "AVAILABLE" && reservation.physicalCopyId) {
        const release = await tx.physicalCopy.updateMany({
          where: { id: reservation.physicalCopyId, copyStatus: "RESERVED" },
          data: { copyStatus: "AVAILABLE" },
        });
        if (release.count !== 1) {
          throw new ReservationError("INVENTORY_CONFLICT", "The reserved copy could not be released.", 409);
        }
        await promoteNextReservation(tx, {
          resourceId: reservation.resourceId,
          copyId: reservation.physicalCopyId,
          now,
          actorUserId: actorId,
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "RESERVATION_CANCELLED",
          entityType: "Reservation",
          entityId: reservationId,
        },
      });
      return { ...reservation, status: "CANCELLED" };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034") {
      throw new ReservationError("RESERVATION_CONFLICT", "The reservation changed. Refresh and try again.", 409);
    }
    throw error;
  }
}

export async function expireReservations(prisma, { now = new Date() } = {}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const expired = await tx.reservation.findMany({
        where: { status: "AVAILABLE", expiresAt: { lte: now } },
        select: { id: true, resourceId: true, physicalCopyId: true },
        orderBy: [{ expiresAt: "asc" }, { reservedAt: "asc" }],
      });
      let expiredCount = 0;
      for (const reservation of expired) {
        const claim = await tx.reservation.updateMany({
          where: { id: reservation.id, status: "AVAILABLE", expiresAt: { lte: now } },
          data: { status: "EXPIRED" },
        });
        if (claim.count !== 1) continue;

        if (reservation.physicalCopyId) {
          const release = await tx.physicalCopy.updateMany({
            where: { id: reservation.physicalCopyId, copyStatus: "RESERVED" },
            data: { copyStatus: "AVAILABLE" },
          });
          if (release.count !== 1) {
            throw new ReservationError("INVENTORY_CONFLICT", "An expired reservation has inconsistent copy inventory.", 409);
          }
          await promoteNextReservation(tx, {
            resourceId: reservation.resourceId,
            copyId: reservation.physicalCopyId,
            now,
          });
        }
        expiredCount += 1;
      }
      return expiredCount;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034") {
      throw new ReservationError("RESERVATION_CONFLICT", "The reservation queue changed. Retry the operation.", 409);
    }
    throw error;
  }
}
