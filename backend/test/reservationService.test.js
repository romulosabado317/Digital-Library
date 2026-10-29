import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelReservation,
  createReservation,
  expireReservations,
  approveReservation,
  ReservationError,
} from "../src/services/reservationService.js";

function createReservationFixture({
  role = "MEMBER",
  accountStatus = "ACTIVE",
  resourceStatus = "ACTIVE",
  resourceType = "BOOK",
  availableCopies = 0,
  existingReservation = null,
  lastReservation = null,
  reservation = null,
  availableCopy = null,
  nextReservation = null,
  expiredReservations = [],
  claimCount = 1,
  copyReleaseCount = 1,
} = {}) {
  const calls = [];
  const tx = {
    user: {
      findUnique: async () => ({ id: "member-1", role, accountStatus }),
    },
    resource: {
      findFirst: async () => resourceStatus === "ACTIVE"
        ? { id: "resource-1", status: "ACTIVE", resourceType }
        : null,
    },
    physicalCopy: {
      count: async () => availableCopies,
      findFirst: async () => availableCopy,
      updateMany: async ({ where, data }) => {
        calls.push({ type: "copy.updateMany", where, data });
        return { count: copyReleaseCount };
      },
    },
    reservation: {
      findFirst: async ({ where, orderBy }) => {
        if (where.userId && where.resourceId) return existingReservation;
        const orderFields = Array.isArray(orderBy) ? orderBy : [orderBy];
        if (orderFields.some((field) => field?.queuePosition === "desc")) return lastReservation;
        return nextReservation;
      },
      findMany: async () => expiredReservations,
      findUnique: async () => reservation,
      create: async ({ data }) => {
        calls.push({ type: "reservation.create", data });
        return { id: "reservation-new", ...data };
      },
      updateMany: async ({ where, data }) => {
        calls.push({ type: "reservation.updateMany", where, data });
        return { count: claimCount };
      },
      update: async ({ where, data }) => {
        calls.push({ type: "reservation.update", where, data });
        return { id: where.id, ...data };
      },
    },
    notification: {
      create: async ({ data }) => calls.push({ type: "notification.create", data }),
    },
    auditLog: {
      create: async ({ data }) => calls.push({ type: "auditLog.create", data }),
    },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      calls.push({ type: "transaction", options });
      return callback(tx);
    },
  };
  return { prisma, calls };
}

test("creates a member reservation at the end of the resource queue", async () => {
  const { prisma, calls } = createReservationFixture({
    lastReservation: { queuePosition: 4 },
  });
  const reservedAt = new Date("2026-10-28T12:00:00.000Z");
  const result = await createReservation(prisma, {
    memberId: "member-1",
    resourceId: "resource-1",
    now: reservedAt,
  });

  test("staff approval holds an available copy for the first waiting member", async () => {
    const firstInQueue = {
      id: "reservation-1",
      userId: "member-2",
      resourceId: "resource-1",
      queuePosition: 1,
      status: "WAITING",
      physicalCopyId: null,
    };
    const { prisma, calls } = createReservationFixture({
      reservation: firstInQueue,
      nextReservation: firstInQueue,
      availableCopy: { id: "copy-1", accessionNumber: "BOOK-001" },
    });
    const now = new Date("2026-10-29T12:00:00.000Z");
    const result = await approveReservation(prisma, {
      reservationId: firstInQueue.id,
      approvedBy: "librarian-1",
      now,
    });

    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.physicalCopyId, "copy-1");
    assert.equal(result.expiresAt.toISOString(), "2026-10-31T12:00:00.000Z");
    assert.ok(calls.some(({ type, where, data }) => (
      type === "reservation.updateMany"
      && where.id === firstInQueue.id
      && data.status === "AVAILABLE"
    )));
    assert.ok(calls.some(({ type, where, data }) => (
      type === "copy.updateMany"
      && where.id === "copy-1"
      && data.copyStatus === "RESERVED"
    )));
    assert.ok(calls.some(({ type, data }) => (
      type === "notification.create"
      && data.userId === "member-2"
      && data.notificationType === "RESERVATION_AVAILABLE"
    )));
    assert.equal(calls[0].options.isolationLevel, "Serializable");
  });

  test("approval rejects when the queue member is not first or no copy is available", async () => {
    const secondInQueue = {
      id: "reservation-2",
      userId: "member-3",
      resourceId: "resource-1",
      queuePosition: 2,
      status: "WAITING",
      physicalCopyId: null,
    };
    const notFirst = createReservationFixture({
      reservation: secondInQueue,
      nextReservation: { ...secondInQueue, id: "reservation-1", queuePosition: 1 },
    });
    await assert.rejects(
      approveReservation(notFirst.prisma, {
        reservationId: secondInQueue.id,
        approvedBy: "librarian-1",
      }),
      (error) => error instanceof ReservationError && error.code === "RESERVATION_NOT_NEXT",
    );

    const noCopy = createReservationFixture({
      reservation: { ...secondInQueue, queuePosition: 1 },
      nextReservation: { ...secondInQueue, queuePosition: 1 },
    });
    await assert.rejects(
      approveReservation(noCopy.prisma, {
        reservationId: secondInQueue.id,
        approvedBy: "librarian-1",
      }),
      (error) => error instanceof ReservationError && error.code === "COPY_UNAVAILABLE",
    );
  });

  assert.equal(result.queuePosition, 5);
  assert.equal(result.status, "WAITING");
  assert.equal(result.expiresAt, null);
  assert.deepEqual(calls.map(({ type }) => type), [
    "transaction",
    "reservation.create",
    "auditLog.create",
  ]);
  assert.equal(calls[0].options.isolationLevel, "Serializable");
});

test("rejects reservations when an available copy can be borrowed", async () => {
  const { prisma, calls } = createReservationFixture({ availableCopies: 1 });
  await assert.rejects(
    createReservation(prisma, { memberId: "member-1", resourceId: "resource-1" }),
    (error) => error instanceof ReservationError && error.code === "COPY_AVAILABLE",
  );
  assert.equal(calls.some(({ type }) => type === "reservation.create"), false);
});

test("members can join the queue when available copies are waiting for staff approval", async () => {
  const { prisma, calls } = createReservationFixture({
    availableCopies: 1,
    nextReservation: { id: "reservation-1", queuePosition: 1, status: "WAITING" },
    lastReservation: { queuePosition: 1 },
  });
  const result = await createReservation(prisma, {
    memberId: "member-2",
    resourceId: "resource-1",
  });

  assert.equal(result.status, "WAITING");
  assert.equal(result.queuePosition, 2);
  assert.ok(calls.some(({ type }) => type === "reservation.create"));
});

test("rejects reservations for digital resources", async () => {
  const { prisma, calls } = createReservationFixture({ resourceType: "DIGITAL_RESOURCE" });
  await assert.rejects(
    createReservation(prisma, { memberId: "member-1", resourceId: "resource-1" }),
    (error) => error instanceof ReservationError && error.code === "RESOURCE_NOT_RESERVABLE",
  );
  assert.equal(calls.some(({ type }) => type === "reservation.create"), false);
});

test("rejects duplicate active reservations for the same member and resource", async () => {
  const { prisma } = createReservationFixture({
    existingReservation: { id: "reservation-1", status: "WAITING" },
  });
  await assert.rejects(
    createReservation(prisma, { memberId: "member-1", resourceId: "resource-1" }),
    (error) => error instanceof ReservationError && error.code === "RESERVATION_EXISTS",
  );
});

test("rejects non-member and inactive accounts", async () => {
  const staff = createReservationFixture({ role: "LIBRARIAN" });
  const inactive = createReservationFixture({ accountStatus: "SUSPENDED" });
  await assert.rejects(
    createReservation(staff.prisma, { memberId: "member-1", resourceId: "resource-1" }),
    (error) => error instanceof ReservationError && error.code === "MEMBER_NOT_FOUND",
  );
  await assert.rejects(
    createReservation(inactive.prisma, { memberId: "member-1", resourceId: "resource-1" }),
    (error) => error instanceof ReservationError && error.code === "MEMBER_INACTIVE",
  );
});

test("cancelling another member's reservation is denied", async () => {
  const { prisma, calls } = createReservationFixture({
    reservation: {
      id: "reservation-1",
      userId: "member-2",
      resourceId: "resource-1",
      status: "WAITING",
      physicalCopyId: null,
    },
  });
  await assert.rejects(
    cancelReservation(prisma, {
      reservationId: "reservation-1",
      actorId: "member-1",
      actorRole: "MEMBER",
    }),
    (error) => error instanceof ReservationError && error.code === "RESERVATION_FORBIDDEN",
  );
  assert.equal(calls.some(({ type }) => type === "reservation.updateMany"), false);
});

test("cancelling a ready reservation releases the copy for staff approval", async () => {
  const next = {
    id: "reservation-2",
    userId: "member-3",
    resourceId: "resource-1",
    status: "WAITING",
    physicalCopyId: null,
    queuePosition: 2,
  };
  const { prisma, calls } = createReservationFixture({
    reservation: {
      id: "reservation-1",
      userId: "member-1",
      resourceId: "resource-1",
      status: "AVAILABLE",
      physicalCopyId: "copy-1",
    },
    nextReservation: next,
  });
  const now = new Date("2026-10-28T12:00:00.000Z");
  const result = await cancelReservation(prisma, {
    reservationId: "reservation-1",
    actorId: "member-1",
    actorRole: "MEMBER",
    now,
  });

  assert.equal(result.status, "CANCELLED");
  assert.equal(calls.some(({ type, data }) => type === "reservation.updateMany" && data.status === "AVAILABLE"), false);
  assert.equal(calls.some(({ type, data }) => type === "notification.create"
    && data.userId === "member-3"
    && data.notificationType === "RESERVATION_AVAILABLE"), false);
  assert.ok(calls.some(({ type, data }) => type === "copy.updateMany" && data.copyStatus === "AVAILABLE"));
});

test("reports reservation status conflicts without changing inventory", async () => {
  const { prisma, calls } = createReservationFixture({
    reservation: {
      id: "reservation-1",
      userId: "member-1",
      resourceId: "resource-1",
      status: "FULFILLED",
      physicalCopyId: "copy-1",
    },
  });
  await assert.rejects(
    cancelReservation(prisma, {
      reservationId: "reservation-1",
      actorId: "member-1",
      actorRole: "MEMBER",
    }),
    (error) => error instanceof ReservationError && error.code === "RESERVATION_NOT_ACTIVE",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("expiry releases the held copy and leaves the next member waiting for approval", async () => {
  const { prisma, calls } = createReservationFixture({
    expiredReservations: [{
      id: "reservation-expired",
      resourceId: "resource-1",
      physicalCopyId: "copy-1",
    }],
    nextReservation: {
      id: "reservation-next",
      userId: "member-2",
    },
  });
  const count = await expireReservations(prisma, {
    now: new Date("2026-10-28T12:00:00.000Z"),
  });

  assert.equal(count, 1);
  assert.ok(calls.some(({ type, data }) => type === "reservation.updateMany" && data.status === "EXPIRED"));
  assert.equal(calls.some(({ type, data }) => type === "reservation.updateMany" && data.status === "AVAILABLE"), false);
  assert.equal(calls.some(({ type, data }) => type === "notification.create"
    && data.userId === "member-2"), false);
  assert.ok(calls.some(({ type, data }) => type === "copy.updateMany" && data.copyStatus === "AVAILABLE"));
});
