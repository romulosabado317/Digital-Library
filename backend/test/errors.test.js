import assert from "node:assert/strict";
import test from "node:test";
import { errorHandler } from "../src/utils/errors.js";

function invokeErrorHandler(error) {
  let statusCode;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  errorHandler(error, {}, res, () => {});
  return { statusCode, body };
}

test("duplicate database values become safe conflict responses", () => {
  const result = invokeErrorHandler({ code: "P2002", meta: { target: ["email"] } });
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, "DUPLICATE_RECORD");
  assert.equal(JSON.stringify(result.body).includes("email"), false);
});

test("invalid relation references become safe client errors", () => {
  const result = invokeErrorHandler({ code: "P2003", meta: { field_name: "resource_id" } });
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error.code, "INVALID_REFERENCE");
});

test("missing database records become safe not-found responses", () => {
  const result = invokeErrorHandler({ code: "P2025", meta: { cause: "private details" } });
  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error.code, "RECORD_NOT_FOUND");
  assert.equal(JSON.stringify(result.body).includes("private details"), false);
});
