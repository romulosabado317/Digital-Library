import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import test from "node:test";
import {
  UserProvisioningError,
  createManagedUser,
} from "../src/services/userProvisioningService.js";

function createPrismaFixture(existingUser = null) {
  const calls = [];
  return {
    calls,
    prisma: {
      user: {
        findUnique: async (query) => {
          calls.push({ type: "findUnique", query });
          return existingUser;
        },
        create: async ({ data, select }) => {
          calls.push({ type: "create", data, select });
          return {
            id: "created-user-1",
            fullName: data.fullName,
            email: data.email,
            role: data.role,
            accountStatus: data.accountStatus,
            mustChangePassword: data.mustChangePassword,
          };
        },
      },
    },
  };
}

test("creates a normalized active librarian and stores only a password hash", async () => {
  const { prisma, calls } = createPrismaFixture();
  const user = await createManagedUser(prisma, {
    fullName: "  Alex Librarian ",
    email: "  ALEX@ICCT.EDU.PH ",
    password: "A unique password 12",
    role: "LIBRARIAN",
  });

  assert.equal(user.fullName, "Alex Librarian");
  assert.equal(user.email, "alex@icct.edu.ph");
  assert.equal(user.role, "LIBRARIAN");
  assert.equal(user.accountStatus, "ACTIVE");
  assert.equal(user.mustChangePassword, false);
  assert.equal(Object.hasOwn(calls[1].data, "password"), false);
  assert.equal(await bcrypt.compare("A unique password 12", calls[1].data.passwordHash), true);
});

test("creates active member accounts", async () => {
  const { prisma } = createPrismaFixture();
  const user = await createManagedUser(prisma, {
    fullName: "Student Member",
    email: "student@example.test",
    password: "A unique password 12",
    role: "MEMBER",
  });

  assert.equal(user.role, "MEMBER");
  assert.equal(user.accountStatus, "ACTIVE");
  assert.equal(user.mustChangePassword, true);
});

test("rejects passwords shorter than 8 characters before database access", async () => {
  const { prisma, calls } = createPrismaFixture();
  await assert.rejects(
    createManagedUser(prisma, {
      fullName: "Student",
      email: "student@example.test",
      password: "short7!",
      role: "MEMBER",
    }),
    (error) => error instanceof UserProvisioningError && error.code === "WEAK_PASSWORD",
  );
  assert.equal(calls.length, 0);
});

test("rejects passwords longer than bcrypt's 72-byte limit", async () => {
  const { prisma, calls } = createPrismaFixture();
  await assert.rejects(
    createManagedUser(prisma, {
      fullName: "Student",
      email: "student@example.test",
      password: "A".repeat(73),
      role: "MEMBER",
    }),
    (error) => error instanceof UserProvisioningError && error.code === "WEAK_PASSWORD",
  );
  assert.equal(calls.length, 0);
});

test("rejects invalid roles before database access", async () => {
  const { prisma, calls } = createPrismaFixture();
  await assert.rejects(
    createManagedUser(prisma, {
      fullName: "Another Admin",
      email: "admin@example.test",
      password: "A unique password 12",
      role: "ADMIN",
    }),
    (error) => error instanceof UserProvisioningError && error.code === "INVALID_ROLE",
  );
  assert.equal(calls.length, 0);
});

test("does not overwrite an existing account", async () => {
  const { prisma, calls } = createPrismaFixture({ id: "existing-user" });
  await assert.rejects(
    createManagedUser(prisma, {
      fullName: "Student",
      email: "student@example.test",
      password: "A unique password 12",
      role: "MEMBER",
    }),
    (error) => error instanceof UserProvisioningError && error.code === "ACCOUNT_EXISTS",
  );
  assert.equal(calls.length, 1);
});

test("rejects invalid names and emails before database access", async () => {
  const { prisma, calls } = createPrismaFixture();
  await assert.rejects(
    createManagedUser(prisma, {
      fullName: " ",
      email: "not-an-email",
      password: "A unique password 12",
      role: "MEMBER",
    }),
    (error) => error instanceof UserProvisioningError && error.code === "INVALID_EMAIL",
  );
  assert.equal(calls.length, 0);
});
