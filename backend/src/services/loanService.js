import { promoteNextReservation, ReservationError } from "./reservationService.js";

export class LoanError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "LoanError";
    this.code = code;
    this.status = status;
  }
}

const LOAN_PERIOD_DAYS = 14;

export async function issueLoan(prisma, { memberId, copyId, issuedBy, now = new Date() }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.user.findUnique({
        where: { id: memberId },
        select: { id: true, role: true, accountStatus: true },
      });

      if (!member || member.role !== "MEMBER") {
        throw new LoanError("MEMBER_NOT_FOUND", "An active member account is required.", 404);
      }
      if (member.accountStatus !== "ACTIVE") {
        throw new LoanError("MEMBER_INACTIVE", "This member account is not active.", 409);
      }

      const copy = await tx.physicalCopy.findUnique({
        where: { id: copyId },
        include: { resource: { select: { id: true, status: true } } },
      });

      if (!copy || !copy.resource || copy.resource.status !== "ACTIVE") {
        throw new LoanError("COPY_NOT_FOUND", "An active resource copy was not found.", 404);
      }
      let reservation = null;
      if (copy.copyStatus === "RESERVED") {
        reservation = await tx.reservation.findFirst({
          where: {
            userId: memberId,
            resourceId: copy.resource.id,
            physicalCopyId: copyId,
            status: "AVAILABLE",
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (!reservation) {
          throw new LoanError("COPY_RESERVED", "This copy is being held for another member.", 409);
        }
      } else if (copy.copyStatus !== "AVAILABLE") {
        throw new LoanError("COPY_UNAVAILABLE", "This copy is not available for borrowing.", 409);
      }

      const claim = await tx.physicalCopy.updateMany({
        where: { id: copyId, copyStatus: copy.copyStatus },
        data: { copyStatus: "ON_LOAN" },
      });
      if (claim.count !== 1) {
        throw new LoanError("COPY_UNAVAILABLE", "This copy is not available for borrowing.", 409);
      }
      if (reservation) {
        const fulfillment = await tx.reservation.updateMany({
          where: { id: reservation.id, status: "AVAILABLE", expiresAt: { gt: now } },
          data: { status: "FULFILLED" },
        });
        if (fulfillment.count !== 1) {
          throw new LoanError("COPY_RESERVED", "The reservation hold has expired or changed.", 409);
        }
      }

      const dueAt = new Date(now);
      dueAt.setUTCDate(dueAt.getUTCDate() + LOAN_PERIOD_DAYS);

      const loan = await tx.loan.create({
        data: {
          userId: memberId,
          physicalCopyId: copyId,
          issuedById: issuedBy,
          borrowedAt: now,
          dueAt,
          loanStatus: "ACTIVE",
        },
      });

      await tx.notification.create({
        data: {
          userId: memberId,
          title: "Resource borrowed",
          message: `Your loan is due on ${dueAt.toISOString().slice(0, 10)}.`,
          notificationType: "LOAN_ISSUED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: issuedBy,
          action: "LOAN_ISSUED",
          entityType: "Loan",
          entityId: loan.id,
          metadata: { memberId, copyId },
        },
      });

      return loan;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034" || error?.code === "P2002") {
      throw new LoanError("COPY_UNAVAILABLE", "The copy was issued by another transaction. Refresh and try again.", 409);
    }
    throw error;
  }
}

export async function returnLoan(prisma, { loanId, returnedBy, now = new Date() }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({
        where: { id: loanId },
        include: {
          physicalCopy: { select: { id: true, copyStatus: true, resourceId: true } },
          user: { select: { id: true } },
        },
      });

      if (!loan) {
        throw new LoanError("LOAN_NOT_FOUND", "The loan record was not found.", 404);
      }
      if (!["ACTIVE", "OVERDUE"].includes(loan.loanStatus) || loan.returnedAt) {
        throw new LoanError("LOAN_NOT_ACTIVE", "This loan has already been returned or is not active.", 409);
      }

      const claim = await tx.loan.updateMany({
        where: {
          id: loanId,
          loanStatus: { in: ["ACTIVE", "OVERDUE"] },
          returnedAt: null,
        },
        data: { loanStatus: "RETURNED", returnedAt: now },
      });
      if (claim.count !== 1) {
        throw new LoanError("LOAN_NOT_ACTIVE", "This loan has already been returned.", 409);
      }

      const release = await tx.physicalCopy.updateMany({
        where: { id: loan.physicalCopyId, copyStatus: "ON_LOAN" },
        data: { copyStatus: "AVAILABLE" },
      });
      if (release.count !== 1) {
        throw new LoanError("INVENTORY_CONFLICT", "The physical copy is not marked as on loan.", 409);
      }
      try {
        await promoteNextReservation(tx, {
          resourceId: loan.physicalCopy.resourceId,
          copyId: loan.physicalCopyId,
          now,
          actorUserId: returnedBy,
        });
      } catch (error) {
        if (error instanceof ReservationError) {
          throw new LoanError(error.code, error.message, error.status);
        }
        throw error;
      }

      await tx.notification.create({
        data: {
          userId: loan.userId,
          title: "Resource returned",
          message: "Your resource has been returned and the library inventory has been updated.",
          notificationType: "LOAN_RETURNED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: returnedBy,
          action: "LOAN_RETURNED",
          entityType: "Loan",
          entityId: loan.id,
          metadata: { memberId: loan.userId, copyId: loan.physicalCopyId },
        },
      });

      return { ...loan, loanStatus: "RETURNED", returnedAt: now };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034") {
      throw new LoanError("LOAN_NOT_ACTIVE", "This loan changed during processing. Refresh and try again.", 409);
    }
    throw error;
  }
}