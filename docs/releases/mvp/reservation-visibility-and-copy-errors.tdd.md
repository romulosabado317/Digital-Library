# Reservation visibility and copy identifier TDD evidence

## User journeys

Derived from the user's report; no plan file was used.

- As an administrator or librarian, I can see members waiting for a resource as well as members whose reserved copy is ready for pickup.
- As library staff, when an accession number is already assigned, I receive a clear message explaining that it must be unique.

## RED/GREEN evidence

- **RED checkpoint:** `c35180b` adds regression coverage. `npm run test --workspace backend -- --test-name-pattern="duplicate copy accession"` failed because the API returned generic `DUPLICATE_RECORD` instead of `DUPLICATE_ACCESSION_NUMBER`.
- **Reservation API:** the staff endpoint test returned the waiting reservation and its member/resource details before the UI change. Inspection showed the loan desk requested only `status=AVAILABLE`, omitting `WAITING`; there is no configured frontend component-test harness, so the UI behavior was not captured as an automated RED test.
- **GREEN:** `npm run test:coverage --workspace backend` — 80 tests passed, 0 failed.
- **Coverage:** 94.13% lines, 83.76% branches, and 89.33% functions across exercised backend source files.
- **Frontend build:** `npm run build --workspace frontend` — Vite production build succeeded.
- **Diff hygiene:** `git diff --check` passed.

## Test guarantees

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | A duplicate accession number returns a 409 with a copy-specific, actionable message | `backend/test/api.test.js: duplicate copy accession numbers return an actionable conflict` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 2 | Librarians and administrators can inspect waiting reservations with member, queue position, and resource details | `backend/test/api.test.js: staff can see waiting reservations with member and resource details` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 3 | The frontend production bundle compiles with separate waiting-queue and pickup-hold views | Frontend build | Build | PASS | `npm run build --workspace frontend` |

## Known gaps

No browser E2E/component test framework is configured, so actual rendered staff-page behavior was not automated. The database enforces accession-number uniqueness across all physical copies; staff must enter a different accession number when one is already in use.
