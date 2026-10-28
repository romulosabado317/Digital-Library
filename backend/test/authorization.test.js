import assert from "node:assert/strict";
import test from "node:test";
import { requireRole } from "../src/middleware/requireRole.js";

function invoke(middleware, user) {
  const req = { user };
  let statusCode;
  let responseBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { statusCode, responseBody, nextCalled };
}

test("allows a librarian through a librarian-only guard", () => {
  assert.equal(invoke(requireRole("LIBRARIAN"), { role: "LIBRARIAN" }).nextCalled, true);
});

test("denies a member from a librarian-only route", () => {
  const result = invoke(requireRole("LIBRARIAN"), { role: "MEMBER" });
  assert.equal(result.statusCode, 403);
  assert.equal(result.responseBody.error.code, "FORBIDDEN");
  assert.equal(result.nextCalled, false);
});

test("denies requests without an authenticated user", () => {
  const result = invoke(requireRole("LIBRARIAN"), undefined);
  assert.equal(result.statusCode, 401);
  assert.equal(result.responseBody.error.code, "UNAUTHENTICATED");
});