import assert from "node:assert/strict";
import test from "node:test";
import { issueLoan, LoanError } from "../src/services/loanService.js";

function createPrismaFixture({
  memberStatus = "ACTIVE",
  memberRole = "MEMBER",
  copyStatus = "AVAILABLE",
  resourceStatus = "ACTIVE",
  reservation = null,
  waitingReservation = null,
} = {}) {
  const calls = [];
  const tx = {
    user: {
      findUnique: async () => ({ id: "member-1", role: memberRole, accountStatus: memberStatus }),
    },
    physicalCopy: {
      findUnique: async () => ({
        id: "copy-1",
        copyStatus,
        resource: { id: "resource-1", status: resourceStatus },
      }),
      updateMany: async ({ where, data }) => {
        calls.push({ type: "copy.updateMany", where, data });
        return { count: ["AVAILABLE", "RESERVED"].includes(copyStatus) ? 1 : 0 };
      },
    },
    reservation: {
      findFirst: async ({ where }) => where.status === "WAITING" ? waitingReservation : reservation,
      updateMany: async ({ where, data }) => {
        calls.push({ type: "reservation.updateMany", where, data });
        return { count: 1 };
      },
    },
    loan: {
      create: async ({ data }) => {
        calls.push({ type: "loan.create", data });
        return { id: "loan-1", ...data };
      },
    },
    notification: {
      create: async ({ data }) => {
        calls.push({ type: "notification.create", data });
      },
    },
    auditLog: {
      create: async ({ data }) => {
        calls.push({ type: "auditLog.create", data });
      },
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

test("issues a loan and marks an available copy unavailable in one transaction", async () => {
  const { prisma, calls } = createPrismaFixture();
  const borrowedAt = new Date("2026-10-28T00:00:00.000Z");
  const result = await issueLoan(prisma, {
    memberId: "member-1",
    copyId: "copy-1",
    issuedBy: "librarian-1",
    now: borrowedAt,
  });

  assert.equal(result.id, "loan-1");
  assert.equal(result.loanStatus, "ACTIVE");
  assert.equal(result.dueAt.toISOString(), "2026-11-11T00:00:00.000Z");
  assert.deepEqual(calls.map(({ type }) => type), [
    "transaction",
    "copy.updateMany",
    "loan.create",
    "notification.create",
    "auditLog.create",
  ]);
  assert.equal(calls[0].options.isolationLevel, "Serializable");
  assert.equal(calls[1].where.copyStatus, "AVAILABLE");
  assert.equal(calls[1].data.copyStatus, "ON_LOAN");
});

test("rejects borrowing for an inactive member without changing inventory", async () => {
  const { prisma, calls } = createPrismaFixture({ memberStatus: "INACTIVE" });

  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "MEMBER_INACTIVE",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("rejects a staff account passed as the borrower", async () => {
  const { prisma, calls } = createPrismaFixture({ memberRole: "LIBRARIAN" });

  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "MEMBER_NOT_FOUND",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("rejects an unavailable copy and does not create a loan", async () => {
  const { prisma, calls } = createPrismaFixture({ copyStatus: "ON_LOAN" });

  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "COPY_UNAVAILABLE",
  );
  assert.equal(calls.some(({ type }) => type === "loan.create"), false);
});

test("rejects copies belonging to archived resources", async () => {
  const { prisma, calls } = createPrismaFixture({ resourceStatus: "ARCHIVED" });

  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "COPY_NOT_FOUND",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("issues a reserved copy only to the member holding its active reservation", async () => {
  const { prisma, calls } = createPrismaFixture({
    copyStatus: "RESERVED",
    reservation: { id: "reservation-1" },
  });
  const result = await issueLoan(prisma, {
    memberId: "member-1",
    copyId: "copy-1",
    issuedBy: "librarian-1",
  });

  assert.equal(result.id, "loan-1");
  assert.equal(calls.find(({ type }) => type === "copy.updateMany").where.copyStatus, "RESERVED");
  assert.equal(calls.find(({ type }) => type === "reservation.updateMany").data.status, "FULFILLED");
});

test("rejects a reserved copy when the borrower has no active hold", async () => {
  const { prisma, calls } = createPrismaFixture({ copyStatus: "RESERVED" });
  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "COPY_RESERVED",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
});

test("does not issue an available copy to another member while reservations await approval", async () => {
  const { prisma, calls } = createPrismaFixture({
    waitingReservation: { id: "reservation-waiting-1" },
  });
  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "WAITING_RESERVATION",
  );
  assert.equal(calls.some(({ type }) => type === "copy.updateMany"), false);
  assert.equal(calls.some(({ type }) => type === "loan.create"), false);
});

test("rejects a concurrent issue when the conditional inventory update loses", async () => {
  const { prisma, calls } = createPrismaFixture();
  prisma.$transaction = async (callback) => {
    const tx = {
      user: {
        findUnique: async () => ({ id: "member-1", role: "MEMBER", accountStatus: "ACTIVE" }),
      },
      physicalCopy: {
        findUnique: async () => ({
          id: "copy-1",
          copyStatus: "AVAILABLE",
          resource: { id: "resource-1", status: "ACTIVE" },
        }),
        updateMany: async () => ({ count: 0 }),
      },
      reservation: { findFirst: async () => null },
      loan: { create: async () => assert.fail("must not create a loan") },
      notification: { create: async () => assert.fail("must not notify") },
      auditLog: { create: async () => assert.fail("must not audit") },
    };
    return callback(tx);
  };

  await assert.rejects(
    issueLoan(prisma, {
      memberId: "member-1",
      copyId: "copy-1",
      issuedBy: "librarian-1",
    }),
    (error) => error instanceof LoanError && error.code === "COPY_UNAVAILABLE",
  );
  assert.equal(calls.length, 0);
});

test("maps serializable and unique-index conflicts to retryable inventory conflicts", async () => {
  for (const prismaErrorCode of ["P2034", "P2002"]) {
    const prisma = {
      $transaction: async () => { throw { code: prismaErrorCode }; },
    };
    await assert.rejects(
      issueLoan(prisma, {
        memberId: "member-1",
        copyId: "copy-1",
        issuedBy: "librarian-1",
      }),
      (error) => error instanceof LoanError
        && error.code === "COPY_UNAVAILABLE"
        && error.status === 409,
    );
  }
});