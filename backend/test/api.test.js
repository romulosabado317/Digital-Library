import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import request from "supertest";
import test from "node:test";
import { createApp } from "../src/app.js";
import { hashSessionToken } from "../src/middleware/authenticate.js";

const cookieName = "digital_library_session";
const librarianToken = "test-librarian-session";
const memberToken = "test-member-session";
const adminToken = "test-admin-session";

function createApiFixture({
  activeReservationCount = 0,
  nodeEnv = "test",
  memberMustChangePassword = false,
  simulatePasswordChangeBeforeLoginSession = false,
  duplicateCopyIdentifier = false,
  staffReservations = [],
} = {}) {
  const users = {
    "librarian-1": {
      id: "librarian-1",
      fullName: "Library Staff",
      email: "librarian@example.test",
      role: "LIBRARIAN",
      accountStatus: "ACTIVE",
      passwordHash: bcrypt.hashSync("correct-password", 4),
    },
    "member-1": {
      id: "member-1",
      fullName: "Demo Member",
      email: "member@example.test",
      role: "MEMBER",
      accountStatus: "ACTIVE",
      mustChangePassword: memberMustChangePassword,
      passwordHash: bcrypt.hashSync("temporary-password", 4),
    },
    "admin-1": {
      id: "admin-1",
      fullName: "Library Administrator",
      email: "admin@example.test",
      role: "ADMIN",
      accountStatus: "ACTIVE",
    },
  };
  const sessions = new Map([
    [hashSessionToken(librarianToken), users["librarian-1"]],
    [hashSessionToken(memberToken), users["member-1"]],
    [hashSessionToken(adminToken), users["admin-1"]],
  ]);
  const sessionDeleteCalls = [];
  const sessionCreateCalls = [];
  const activeLoan = {
    id: "loan-1",
    userId: "member-1",
    physicalCopyId: "copy-1",
    loanStatus: "ACTIVE",
    borrowedAt: new Date("2026-10-28T00:00:00.000Z"),
    dueAt: new Date("2026-11-11T00:00:00.000Z"),
    returnedAt: null,
    user: { id: "member-1", fullName: "Demo Member", email: "member@example.test" },
    physicalCopy: {
      id: "copy-1",
      resourceId: "resource-1",
      resource: { id: "resource-1", title: "Foundations of Digital Libraries" },
    },
  };
  const activeResource = {
    id: "resource-1",
    title: "Foundations of Digital Libraries",
    description: "Synthetic demonstration title.",
    isbn: "9780000000001",
    digitalFileUrl: "https://private.example.test/file.pdf",
    publicationYear: 2025,
    resourceType: "BOOK",
    status: "ACTIVE",
    category: { id: "category-1", name: "Computer Science" },
    publisher: { id: "publisher-1", name: "Open Learning Press" },
    authors: [{ author: { id: "author-1", name: "Demo Author" } }],
    copies: [{ id: "copy-1", accessionNumber: "DEMO-0001", copyStatus: "AVAILABLE" }],
  };
  const tx = {
    user: {
      findUnique: async ({ where }) => where.id
        ? users[where.id] ?? null
        : Object.values(users).find((user) => user.email === where.email) ?? null,
      updateMany: async ({ where, data }) => {
        if (simulatePasswordChangeBeforeLoginSession && users[where.id]) {
          users[where.id].passwordHash = bcrypt.hashSync("changed-concurrently", 4);
          simulatePasswordChangeBeforeLoginSession = false;
        }
        const user = users[where.id];
        if (!user || user.passwordHash !== where.passwordHash) return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      },
      create: async ({ data }) => ({
        id: "managed-user-1",
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        accountStatus: data.accountStatus,
        mustChangePassword: data.mustChangePassword,
      }),
    },
    session: {
      create: async (args) => {
        sessionCreateCalls.push(args);
        return { id: "created-session" };
      },
      deleteMany: async (args) => {
        sessionDeleteCalls.push(args);
        return { count: 1 };
      },
    },
    physicalCopy: {
      findUnique: async () => ({
        id: "copy-1",
        copyStatus: "AVAILABLE",
        resource: { id: "resource-1", status: "ACTIVE" },
      }),
      updateMany: async () => ({ count: 1 }),
      count: async () => 0,
      create: async ({ data }) => {
        if (duplicateCopyIdentifier) {
          throw Object.assign(new Error("Unique constraint failed"), {
            code: "P2002",
            meta: { target: ["accession_number"] },
          });
        }
        return { id: "copy-2", ...data };
      },
    },
    loan: {
      findUnique: async () => activeLoan,
      updateMany: async () => ({ count: 1 }),
      create: async ({ data }) => ({ id: "loan-1", ...data }),
    },
    reservation: {
      findFirst: async ({ where }) => where.userId ? null : null,
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => activeReservationCount,
      create: async ({ data }) => ({ id: "reservation-1", ...data }),
      updateMany: async () => ({ count: 1 }),
    },
    notification: { create: async () => ({ id: "notification-1" }) },
    auditLog: { create: async () => ({ id: "audit-1" }) },
    resource: {
      findFirst: async ({ where }) => (
        where.status === "ACTIVE"
        && ["resource-1", "digital-resource-1"].includes(where.id)
      )
        ? {
          id: where.id,
          status: "ACTIVE",
          resourceType: where.id === "digital-resource-1" ? "DIGITAL_RESOURCE" : "BOOK",
        }
        : null,
      create: async ({ data }) => ({ id: "resource-2", ...data }),
      update: async ({ data }) => ({ id: "resource-1", ...data }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id) return users[where.id] ? { ...users[where.id] } : null;
        const user = Object.values(users).find((candidate) => candidate.email === where.email);
        return user ? { ...user } : null;
      },
      findMany: async () => [{
        id: "member-1",
        fullName: "Demo Member",
        email: "member@example.test",
      }],
    },
    session: {
      findUnique: async ({ where }) => {
        const user = sessions.get(where.tokenHash);
        return user ? {
          id: "session-1",
          expiresAt: new Date(Date.now() + 60_000),
          user,
        } : null;
      },
      create: async (args) => {
        sessionCreateCalls.push(args);
        return { id: "created-session" };
      },
      deleteMany: async () => ({ count: 1 }),
    },
    physicalCopy: {
      findMany: async () => [{
        id: "copy-1",
        accessionNumber: "DEMO-0001",
        resource: { id: "resource-1", title: "Foundations of Digital Libraries", isbn: "9780000000001" },
      }],
      count: async () => 0,
    },
    resource: {
      findMany: async ({ where, select }) => {
        if (where.status !== "ACTIVE") return [];
        const result = { ...activeResource };
        if (select && !Object.hasOwn(select, "digitalFileUrl")) delete result.digitalFileUrl;
        return [result];
      },
      findUnique: async ({ where }) => where.id === "resource-1" ? activeResource : null,
      findFirst: async ({ where, select }) => {
        if (where.id !== "resource-1" || where.status !== "ACTIVE") return null;
        const result = { ...activeResource };
        if (select && !Object.hasOwn(select, "digitalFileUrl")) delete result.digitalFileUrl;
        return result;
      },
      count: async () => 1,
    },
    category: { findMany: async () => [{ id: "category-1", name: "Computer Science" }] },
    author: { findMany: async () => [{ id: "author-1", name: "Demo Author" }] },
    publisher: { findMany: async () => [{ id: "publisher-1", name: "Open Learning Press" }] },
    loan: {
      findMany: async ({ where }) => where.userId
        ? [activeLoan]
        : where.loanStatus === "ACTIVE"
          ? [activeLoan]
          : [],
    },
    reservation: {
      findMany: async ({ where = {} } = {}) => staffReservations.filter((reservation) => (
        (!where.status || reservation.status === where.status)
        && (!where.userId || reservation.userId === where.userId)
      )),
    },
    $transaction: async (callback) => callback(tx),
  };
  prisma.session = {
    findUnique: async ({ where }) => {
      const user = sessions.get(where.tokenHash);
      return user ? {
        id: "session-1",
        expiresAt: new Date(Date.now() + 60_000),
        user,
      } : null;
    },
    create: async (args) => {
      sessionCreateCalls.push(args);
      return { id: "created-session" };
    },
    deleteMany: async () => ({ count: 1 }),
  };
  tx.session.deleteMany = async (args) => {
    sessionDeleteCalls.push(args);
    return { count: 1 };
  };
  const app = createApp({
    prisma,
    env: {
      NODE_ENV: nodeEnv,
      FRONTEND_ORIGIN: "http://localhost:5173",
      SESSION_COOKIE_NAME: cookieName,
      SESSION_TTL_DAYS: 7,
    },
  });
  app.locals.testUsers = users;
  app.locals.sessionDeleteCalls = sessionDeleteCalls;
  app.locals.sessionCreateCalls = sessionCreateCalls;
  return app;
}

test("health endpoint responds without authentication", async () => {
  const response = await request(createApiFixture()).get("/api/v1/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, "ok");
});

test("login rejects incorrect credentials without creating a session", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/auth/login")
    .send({ email: "librarian@example.test", password: "wrong-password" });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "INVALID_CREDENTIALS");
});

test("login creates a secure HttpOnly cookie session", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/auth/login")
    .send({ email: "librarian@example.test", password: "correct-password" });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.user.role, "LIBRARIAN");
  assert.match(response.headers["set-cookie"][0], /HttpOnly/i);
  assert.match(response.headers["set-cookie"][0], /SameSite=Lax/i);
});

test("temporary member login exposes the reset requirement and blocks protected features", async () => {
  const app = createApiFixture({ memberMustChangePassword: true });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "member@example.test", password: "temporary-password" });
  const identity = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", `${cookieName}=${memberToken}`);
  const loans = await request(app)
    .get("/api/v1/loans/me")
    .set("Cookie", `${cookieName}=${memberToken}`);

  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.mustChangePassword, true);
  assert.equal(identity.body.data.user.mustChangePassword, true);
  assert.equal(loans.status, 403);
  assert.equal(loans.body.error.code, "PASSWORD_CHANGE_REQUIRED");
});

test("login does not create a session when the verified password changed concurrently", async () => {
  const app = createApiFixture({ simulatePasswordChangeBeforeLoginSession: true });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "member@example.test", password: "temporary-password" });

  assert.equal(login.status, 401);
  assert.equal(login.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(app.locals.sessionCreateCalls.length, 0);
});

test("members change temporary and permanent passwords and keep only the current session", async () => {
  const app = createApiFixture({ memberMustChangePassword: true });
  const invalidCurrentPassword = await request(app)
    .post("/api/v1/auth/password")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ currentPassword: "incorrect-password", newPassword: "A new member password" });
  const samePassword = await request(app)
    .post("/api/v1/auth/password")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ currentPassword: "temporary-password", newPassword: "temporary-password" });
  const changed = await request(app)
    .post("/api/v1/auth/password")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ currentPassword: "temporary-password", newPassword: "A new member password" });
  const changedAgain = await request(app)
    .post("/api/v1/auth/password")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ currentPassword: "A new member password", newPassword: "An updated member password" });
  const loans = await request(app)
    .get("/api/v1/loans/me")
    .set("Cookie", `${cookieName}=${memberToken}`);
  const oldPasswordLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "member@example.test", password: "temporary-password" });
  const newPasswordLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "member@example.test", password: "A new member password" });
  const updatedPasswordLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "member@example.test", password: "An updated member password" });

  assert.equal(invalidCurrentPassword.status, 401);
  assert.equal(samePassword.status, 400);
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.user.mustChangePassword, false);
  assert.equal(Object.hasOwn(changed.body.data.user, "passwordHash"), false);
  assert.deepEqual(app.locals.sessionDeleteCalls.at(-1), {
    where: { userId: "member-1", id: { not: "session-1" } },
  });
  assert.equal(changedAgain.status, 200);
  assert.equal(await bcrypt.compare("An updated member password", app.locals.testUsers["member-1"].passwordHash), true);
  assert.equal(app.locals.sessionDeleteCalls.length, 2);
  assert.equal(loans.status, 200);
  assert.equal(oldPasswordLogin.status, 401);
  assert.equal(newPasswordLogin.status, 401);
  assert.equal(updatedPasswordLogin.status, 200);
  assert.equal(updatedPasswordLogin.body.data.user.mustChangePassword, false);
});

test("password changes reject weak and oversized passwords", async () => {
  const app = createApiFixture();
  const weak = await request(app)
    .post("/api/v1/auth/password")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ currentPassword: "temporary-password", newPassword: "short" });
  const oversized = await request(app)
    .post("/api/v1/auth/password")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ currentPassword: "temporary-password", newPassword: "é".repeat(37) });

  assert.equal(weak.status, 400);
  assert.equal(oversized.status, 400);
});

test("production sessions allow cross-site frontend requests and remain secure", async () => {
  const app = createApiFixture({ nodeEnv: "production" });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "librarian@example.test", password: "correct-password" });
  const logout = await request(app)
    .post("/api/v1/auth/logout")
    .set("Cookie", `${cookieName}=${librarianToken}`);

  assert.match(login.headers["set-cookie"][0], /SameSite=None/i);
  assert.match(login.headers["set-cookie"][0], /Secure/i);
  assert.match(logout.headers["set-cookie"][0], /SameSite=None/i);
  assert.match(logout.headers["set-cookie"][0], /Secure/i);
});

test("librarian endpoints require authentication and reject member roles", async () => {
  const app = createApiFixture();
  const anonymous = await request(app).get("/api/v1/users");
  const member = await request(app)
    .get("/api/v1/users")
    .set("Cookie", `${cookieName}=${memberToken}`);
  assert.equal(anonymous.status, 401);
  assert.equal(member.status, 403);
});

test("admins can create staff and members, while librarians can create members only", async () => {
  const app = createApiFixture();
  const memberPayload = {
    fullName: "New Library Member",
    email: "member-new@icct.edu.ph",
    password: "A unique password 12",
    role: "MEMBER",
  };
  const librarianPayload = { ...memberPayload, email: "staff@icct.edu.ph", role: "LIBRARIAN" };
  const anonymous = await request(app).post("/api/v1/users").send(memberPayload);
  const librarian = await request(app)
    .post("/api/v1/users")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send(memberPayload);
  const librarianCreatingStaff = await request(app)
    .post("/api/v1/users")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send(librarianPayload);
  const member = await request(app)
    .post("/api/v1/users")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send(memberPayload);
  const admin = await request(app)
    .post("/api/v1/users")
    .set("Cookie", `${cookieName}=${adminToken}`)
    .send(librarianPayload);

  assert.equal(anonymous.status, 401);
  assert.equal(librarian.status, 201);
  assert.equal(librarian.body.data.user.role, "MEMBER");
  assert.equal(librarianCreatingStaff.status, 403);
  assert.equal(member.status, 403);
  assert.equal(admin.status, 201);
  assert.equal(admin.body.data.user.role, "LIBRARIAN");
  assert.equal(Object.hasOwn(admin.body.data.user, "passwordHash"), false);
});

test("account creation rejects invalid roles and malformed account data", async () => {
  const app = createApiFixture();
  const invalidRole = await request(app)
    .post("/api/v1/users")
    .set("Cookie", `${cookieName}=${adminToken}`)
    .send({
      fullName: "Another Administrator",
      email: "other@example.test",
      password: "A unique password 12",
      role: "ADMIN",
    });
  const shortPassword = await request(app)
    .post("/api/v1/users")
    .set("Cookie", `${cookieName}=${adminToken}`)
    .send({
      fullName: "New Member",
      email: "new@example.test",
      password: "short7!",
      role: "MEMBER",
    });

  assert.equal(invalidRole.status, 400);
  assert.equal(shortPassword.status, 400);
});

test("authenticated staff can load member and available-copy options", async () => {
  const app = createApiFixture();
  const members = await request(app)
    .get("/api/v1/users")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  const copies = await request(app)
    .get("/api/v1/resources/copies?status=AVAILABLE")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  assert.equal(members.status, 200);
  assert.equal(members.body.data[0].id, "member-1");
  assert.equal(copies.status, 200);
  assert.equal(copies.body.data[0].accessionNumber, "DEMO-0001");
});

test("available-copy endpoint rejects an unsupported status filter", async () => {
  const response = await request(createApiFixture())
    .get("/api/v1/resources/copies?status=INVALID")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("public catalog validates search filters and returns resource records", async () => {
  const response = await request(createApiFixture())
    .get("/api/v1/resources?search=digital");
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].title, "Foundations of Digital Libraries");
  assert.equal(response.body.meta.page, 1);
  assert.equal(Object.hasOwn(response.body.data[0], "digitalFileUrl"), false);
});

test("public catalog rejects malformed pagination and unknown resource types", async () => {
  const app = createApiFixture();
  const invalidPage = await request(app).get("/api/v1/resources?page=0");
  const invalidType = await request(app).get("/api/v1/resources?resourceType=INVALID");
  assert.equal(invalidPage.status, 400);
  assert.equal(invalidType.status, 400);
});

test("public resource details only return active catalog records", async () => {
  const app = createApiFixture();
  const found = await request(app).get("/api/v1/resources/resource-1");
  const missing = await request(app).get("/api/v1/resources/unknown");
  assert.equal(found.status, 200);
  assert.equal(found.body.data.resource.id, "resource-1");
  assert.equal(Object.hasOwn(found.body.data.resource, "digitalFileUrl"), false);
  assert.equal(missing.status, 404);
});

test("librarians can create resources, but members cannot", async () => {
  const payload = {
    title: "New Library Resource",
    resourceType: "BOOK",
    publicationYear: 2024,
    publisherName: "Example Press",
    authorNames: ["Example Author"],
  };
  const app = createApiFixture();
  const staff = await request(app)
    .post("/api/v1/resources")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send(payload);
  const member = await request(app)
    .post("/api/v1/resources")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send(payload);
  assert.equal(staff.status, 201);
  assert.equal(staff.body.data.resource.title, payload.title);
  assert.deepEqual(staff.body.data.resource.publisher, {
    connectOrCreate: {
      where: { name: payload.publisherName },
      create: { name: payload.publisherName },
    },
  });
  assert.deepEqual(staff.body.data.resource.authors, {
    create: [{
      author: {
        connectOrCreate: {
          where: { name: payload.authorNames[0] },
          create: { name: payload.authorNames[0] },
        },
      },
    }],
  });
  assert.equal(member.status, 403);
});

test("librarians can update resource metadata and members cannot", async () => {
  const app = createApiFixture();
  const staff = await request(app)
    .patch("/api/v1/resources/resource-1")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({
      title: "Updated Library Resource",
      publisherName: "Updated Press",
      authorNames: ["Updated Author"],
    });
  const member = await request(app)
    .patch("/api/v1/resources/resource-1")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ title: "Unauthorized edit" });
  assert.equal(staff.status, 200);
  assert.equal(staff.body.data.resource.title, "Updated Library Resource");
  assert.deepEqual(staff.body.data.resource.publisher, {
    connectOrCreate: {
      where: { name: "Updated Press" },
      create: { name: "Updated Press" },
    },
  });
  assert.deepEqual(staff.body.data.resource.authors, {
    deleteMany: {},
    create: [{
      author: {
        connectOrCreate: {
          where: { name: "Updated Author" },
          create: { name: "Updated Author" },
        },
      },
    }],
  });
  assert.equal(member.status, 403);
});

test("empty resource updates are rejected", async () => {
  const response = await request(createApiFixture())
    .patch("/api/v1/resources/resource-1")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({});
  assert.equal(response.status, 400);
});

test("resource creation validates fields before database writes", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/resources")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({ title: " ", resourceType: "INVALID" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("librarians can add physical copies but members cannot", async () => {
  const app = createApiFixture();
  const payload = { accessionNumber: "NEW-0001", barcode: "NEW-BAR-0001" };
  const staff = await request(app)
    .post("/api/v1/resources/resource-1/copies")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send(payload);
  const member = await request(app)
    .post("/api/v1/resources/resource-1/copies")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send(payload);
  assert.equal(staff.status, 201);
  assert.equal(staff.body.data.copy.accessionNumber, payload.accessionNumber);
  assert.equal(member.status, 403);
});

test("duplicate copy accession numbers return an actionable conflict", async () => {
  const response = await request(createApiFixture({ duplicateCopyIdentifier: true }))
    .post("/api/v1/resources/resource-1/copies")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({ accessionNumber: "1" });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "DUPLICATE_ACCESSION_NUMBER");
  assert.match(response.body.error.message, /already assigned/i);
});

test("physical copies cannot be added to digital resources", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/resources/digital-resource-1/copies")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({ accessionNumber: "DIGITAL-COPY-0001" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "PHYSICAL_COPY_NOT_ALLOWED");
});

test("resource archive preserves the catalog record and requires staff authorization", async () => {
  const app = createApiFixture();
  const member = await request(app)
    .delete("/api/v1/resources/resource-1")
    .set("Cookie", `${cookieName}=${memberToken}`);
  const staff = await request(app)
    .delete("/api/v1/resources/resource-1")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  assert.equal(member.status, 403);
  assert.equal(staff.status, 204);
});

test("resource archive is blocked while reservations are active", async () => {
  const response = await request(createApiFixture({ activeReservationCount: 1 }))
    .delete("/api/v1/resources/resource-1")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "RESOURCE_HAS_RESERVATIONS");
});

test("members can view their own loans through the self-scoped endpoint", async () => {
  const response = await request(createApiFixture())
    .get("/api/v1/loans/me")
    .set("Cookie", `${cookieName}=${memberToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.data[0].userId, "member-1");
});

test("members can join a reservation queue while staff cannot reserve as a member", async () => {
  const app = createApiFixture();
  const member = await request(app)
    .post("/api/v1/reservations")
    .set("Cookie", `${cookieName}=${memberToken}`)
    .send({ resourceId: "resource-1" });
  const staff = await request(app)
    .post("/api/v1/reservations")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({ resourceId: "resource-1" });
  assert.equal(member.status, 201);
  assert.equal(member.body.data.reservation.status, "WAITING");
  assert.equal(staff.status, 403);
});

test("members see only their own reservation list and staff can inspect the queue", async () => {
  const app = createApiFixture();
  const member = await request(app)
    .get("/api/v1/reservations/me")
    .set("Cookie", `${cookieName}=${memberToken}`);
  const staff = await request(app)
    .get("/api/v1/reservations?status=WAITING")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  const memberStaffList = await request(app)
    .get("/api/v1/reservations")
    .set("Cookie", `${cookieName}=${memberToken}`);
  assert.equal(member.status, 200);
  assert.equal(staff.status, 200);
  assert.equal(memberStaffList.status, 403);
});

test("staff can see waiting reservations with member and resource details", async () => {
  const waitingReservation = {
    id: "reservation-waiting-1",
    userId: "member-1",
    resourceId: "resource-1",
    queuePosition: 1,
    status: "WAITING",
    reservedAt: new Date("2026-10-29T00:00:00.000Z"),
    user: { id: "member-1", fullName: "Demo Member", email: "member@example.test" },
    resource: { id: "resource-1", title: "Foundations of Digital Libraries" },
    physicalCopy: null,
  };
  const app = createApiFixture({ staffReservations: [waitingReservation] });
  const response = await request(app)
    .get("/api/v1/reservations?status=WAITING")
    .set("Cookie", `${cookieName}=${librarianToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].status, "WAITING");
  assert.equal(response.body.data[0].queuePosition, 1);
  assert.equal(response.body.data[0].user.fullName, "Demo Member");
  assert.equal(response.body.data[0].resource.title, "Foundations of Digital Libraries");
});

test("staff can list active loans, while members cannot", async () => {
  const app = createApiFixture();
  const staff = await request(app)
    .get("/api/v1/loans?status=ACTIVE")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  const member = await request(app)
    .get("/api/v1/loans?status=ACTIVE")
    .set("Cookie", `${cookieName}=${memberToken}`);
  assert.equal(staff.status, 200);
  assert.equal(staff.body.data[0].id, "loan-1");
  assert.equal(member.status, 403);
});

test("staff can return a loan, while members are denied", async () => {
  const app = createApiFixture();
  const member = await request(app)
    .post("/api/v1/loans/loan-1/return")
    .set("Cookie", `${cookieName}=${memberToken}`);
  const staff = await request(app)
    .post("/api/v1/loans/loan-1/return")
    .set("Cookie", `${cookieName}=${librarianToken}`);
  assert.equal(member.status, 403);
  assert.equal(staff.status, 200);
  assert.equal(staff.body.data.loan.loanStatus, "RETURNED");
});

test("authenticated users can retrieve their own session identity and sign out", async () => {
  const app = createApiFixture();
  const identity = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", `${cookieName}=${memberToken}`);
  const logout = await request(app)
    .post("/api/v1/auth/logout")
    .set("Cookie", `${cookieName}=${memberToken}`);
  assert.equal(identity.status, 200);
  assert.equal(identity.body.data.user.id, "member-1");
  assert.equal(logout.status, 200);
  assert.equal(logout.body.data.loggedOut, true);
  assert.match(logout.headers["set-cookie"][0], /Expires=/i);
  assert.match(logout.headers["set-cookie"][0], /SameSite=Lax/i);
});

test("API rejects requests from an unapproved origin", async () => {
  const response = await request(createApiFixture())
    .get("/api/v1/health")
    .set("Origin", "https://unapproved.example");
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "ORIGIN_NOT_ALLOWED");
});

test("librarian can issue a loan and receives its due date", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/loans")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({ memberId: "member-1", copyId: "copy-1" });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.loan.loanStatus, "ACTIVE");
  assert.ok(response.body.data.loan.dueAt);
});

test("loan endpoint rejects malformed request bodies", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/loans")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .send({ memberId: "", copyId: "copy-1" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("API rejects malformed JSON with a safe client error", async () => {
  const response = await request(createApiFixture())
    .post("/api/v1/loans")
    .set("Cookie", `${cookieName}=${librarianToken}`)
    .set("Content-Type", "application/json")
    .send("{");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "MALFORMED_JSON");
});
