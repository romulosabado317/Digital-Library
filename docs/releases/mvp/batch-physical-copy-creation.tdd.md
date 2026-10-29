# Batch physical copy creation TDD evidence

## User journey

Derived from the user's request; no plan file was used.

As an administrator or librarian, I can enter a quantity, accession prefix, and starting number to register multiple physical copies at once with unique accession numbers.

## RED/GREEN evidence

- **RED checkpoint:** `46a62c7` adds tests for batch numbering and rejecting quantities above the limit. The creation test failed because the API only accepted one accession number.
- **GREEN:** `npm run test:coverage --workspace backend` — 82 tests passed, 0 failed.
- **Coverage:** 94.22% lines, 84.12% branches, and 89.61% functions across exercised backend source files.
- **Frontend build:** `npm run build --workspace frontend` — Vite production build succeeded.
- **Diff hygiene:** checked changed implementation paths with `git diff --check`.

## Test guarantees

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Staff can add three copies and receive unique, zero-padded accession numbers (`BOOK-001` through `BOOK-003`) | `backend/test/api.test.js: staff can add a batch of uniquely numbered physical copies` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 2 | Batch quantities above 100 are rejected before creating copies | `backend/test/api.test.js: batch copy creation rejects quantities over 100 before database writes` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 3 | Existing one-copy API callers retain their response shape | `backend/test/api.test.js: librarians can add physical copies but members cannot` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 4 | Duplicate accession numbers return an actionable conflict | `backend/test/api.test.js: duplicate copy accession numbers return an actionable conflict` | API/integration | PASS | `npm run test:coverage --workspace backend` |

## Implementation notes and gaps

The batch endpoint creates each physical copy and audit record in one database transaction; a unique-value conflict rolls back the batch. Each generated copy starts as available. The UI explains the generated-number pattern and reports the batch size. There is no configured frontend component/E2E test harness, so the UI was build-validated but not browser-flow tested.
