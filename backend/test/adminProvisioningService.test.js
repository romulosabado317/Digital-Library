import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import test from "node:test";
import {
  AdminProvisioningError,
  createAdminUser,
} from "../src/services/adminProvisioningService.js";

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
            id: "admin-1",
            fullName: data.fullName,
            email: data.email,
            role: data.role,
            accountStatus: data.accountStatus,
          };
        },
      },
    },
  };
}

test("creates an active admin and stores only a password hash", async () => {
  const { prisma, calls } = createPrismaFixture();
  const admin = await createAdminUser(prisma, {
    email: "  ADMIN@EXAMPLE.TEST ",
    password: "A private password with 16+ chars",
    fullName: "  Library Admin  ",
  });

  assert.equal(admin.email, "admin@example.test");
  assert.equal(admin.role, "ADMIN");
  assert.equal(admin.accountStatus, "ACTIVE");
  assert.equal(calls[1].data.fullName, "Library Admin");
  assert.notEqual(calls[1].data.passwordHash, "A private password with 16+ chars");
  assert.equal(await bcrypt.compare("A private password with 16+ chars", calls[1].data.passwordHash), true);
  assert.equal(Object.hasOwn(calls[1].data, "password"), false);
});

test("rejects short passwords before querying or writing", async () => {
  const { prisma, calls } = createPrismaFixture();
  await assert.rejects(
    createAdminUser(prisma, { email: "admin@example.test", password: "too-short" }),
    (error) => error instanceof AdminProvisioningError && error.code === "WEAK_PASSWORD",
  );
  assert.equal(calls.length, 0);
});

test("does not overwrite an existing account", async () => {
  const { prisma, calls } = createPrismaFixture({ id: "existing-admin" });
  await assert.rejects(
    createAdminUser(prisma, {
      email: "admin@example.test",
      password: "A private password with 16+ chars",
    }),
    (error) => error instanceof AdminProvisioningError && error.code === "ACCOUNT_EXISTS",
  );
  assert.equal(calls.length, 1);
});

test("rejects invalid email addresses", async () => {
  const { prisma, calls } = createPrismaFixture();
  await assert.rejects(
    createAdminUser(prisma, {
      email: "not-an-email",
      password: "A private password with 16+ chars",
    }),
    (error) => error instanceof AdminProvisioningError && error.code === "INVALID_EMAIL",
  );
  assert.equal(calls.length, 0);
});
