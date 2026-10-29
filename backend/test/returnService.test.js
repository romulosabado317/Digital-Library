import assert from "node:assert/strict";
import test from "node:test";
import { LoanError, returnLoan } from "../src/services/loanService.js";

function createReturnFixture({
  loanStatus = "ACTIVE",
  returnedAt = null,
  claimLoanCount = 1,
  claimCopyCount = 1,
  nextReservation = null,
} = {}) {
  const calls = [];
  const loan = {
    id: "loan-1",
    loanStatus,
    returnedAt,
    physicalCopyId: "copy-1",
    userId: "member-1",
    physicalCopy: { id: "copy-1", copyStatus: "ON_LOAN", resourceId: "resource-1" },
    user: { id: "member-1" },
  };
  const tx = {
    loan: {
      findUnique: async () => loanStatus === "MISSING" ? null : loan,
      updateMany: async ({ where, data }) => {
        calls.push({ type: "loan.updateMany", where, data });
        return { count: claimLoanCount };
      },
    },
    physicalCopy: {
      updateMany: async ({ where, data }) => {
        calls.push({ type: "copy.updateMany", where, data });
        return { count: claimCopyCount };
      },
    },
    reservation: {
      findFirst: async () => nextReservation,
      updateMany: async ({ where, data }) => {
        calls.push({ type: "reservation.updateMany", where, data });
        return { count: 1 };
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
  return { prisma, calls, loan };
}

test("returns an overdue loan, releases the copy, and records the return atomically", async () => {
  const { prisma, calls } = createReturnFixture({ loanStatus: "OVERDUE" });
  const returnedAt = new Date("2026-10-28T12:00:00.000Z");
  const result = await returnLoan(prisma, {
    loanId: "loan-1",
    returnedBy: "librarian-1",
    now: returnedAt,
  });
  assert.equal(result.loanStatus, "RETURNED");
  assert.equal(result.returnedAt, returnedAt);
  assert.deepEqual(calls.map(({ type }) => type), [
    "transaction",
    "loan.updateMany",
    "copy.updateMany",
    "notification.create",
    "auditLog.create",
  ]);
  assert.deepEqual(calls[1].where.loanStatus.in, ["ACTIVE", "OVERDUE"]);
  assert.equal(calls[2].data.copyStatus, "AVAILABLE");
  assert.equal(calls[0].options.isolationLevel, "Serializable");
});

test("return leaves the copy available until staff approves the next waiting reservation", async () => {
  const { prisma, calls } = createReturnFixture({
    nextReservation: { id: "reservation-1", userId: "member-2" },
  });
  await returnLoan(prisma, { loanId: "loan-1", returnedBy: "librarian-1" });

  assert.equal(calls.some(({ type }) => type === "reservation.updateMany"), false);
  assert.equal(calls.some(({ type, data }) => type === "notification.create"
    && data.userId === "member-2"
    && data.notificationType === "RESERVATION_AVAILABLE"), false);
  assert.ok(calls.some(({ type, data }) => type === "copy.updateMany" && data.copyStatus === "AVAILABLE"));
  assert.equal(calls.some(({ type, data }) => type === "copy.updateMany" && data.copyStatus === "RESERVED"), false);
});

test("rejects a loan that does not exist", async () => {
  const { prisma, calls } = createReturnFixture({ loanStatus: "MISSING" });
  await assert.rejects(
    returnLoan(prisma, { loanId: "loan-1", returnedBy: "librarian-1" }),
    (error) => error instanceof LoanError && error.code === "LOAN_NOT_FOUND",
  );
  assert.equal(calls.length, 1);
});

test("rejects an already returned loan without changing inventory", async () => {
  const { prisma, calls } = createReturnFixture({ loanStatus: "RETURNED", returnedAt: new Date() });
  await assert.rejects(
    returnLoan(prisma, { loanId: "loan-1", returnedBy: "librarian-1" }),
    (error) => error instanceof LoanError && error.code === "LOAN_NOT_ACTIVE",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("rejects duplicate return processing when the conditional loan update loses", async () => {
  const { prisma, calls } = createReturnFixture({ claimLoanCount: 0 });
  await assert.rejects(
    returnLoan(prisma, { loanId: "loan-1", returnedBy: "librarian-1" }),
    (error) => error instanceof LoanError && error.code === "LOAN_NOT_ACTIVE",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("rejects inconsistent copy status and rolls back return changes", async () => {
  const { prisma, calls } = createReturnFixture({ claimCopyCount: 0 });
  await assert.rejects(
    returnLoan(prisma, { loanId: "loan-1", returnedBy: "librarian-1" }),
    (error) => error instanceof LoanError && error.code === "INVENTORY_CONFLICT",
  );
  assert.equal(calls.some(({ type }) => type === "notification.create"), false);
});

test("maps a serializable return conflict to an active-loan conflict", async () => {
  const prisma = {
    $transaction: async () => {
      throw { code: "P2034" };
    },
  };
  await assert.rejects(
    returnLoan(prisma, { loanId: "loan-1", returnedBy: "librarian-1" }),
    (error) => error instanceof LoanError && error.code === "LOAN_NOT_ACTIVE",
  );
});
