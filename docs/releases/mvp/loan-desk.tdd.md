# Loan desk TDD evidence

## Source plan and user journey

Derived from the user-approved MVP slice plan. Journeys: as a librarian, sign in, issue/return copies, manage catalog records and inventory, and fulfill ready reservations; as a member, view only my own loans/reservations and reserve, cancel, or track a queued resource; as a visitor, search and inspect public catalog records without receiving private digital file URLs.

## RED/GREEN evidence

- **RED (issue):** `node --test backend/test/*.test.js` executed the new tests and failed because the planned `requireRole.js` and `loanService.js` implementations did not yet exist.
- **RED (return):** `node --test backend/test/returnService.test.js` failed because `returnLoan` was not exported before its implementation.
- **RED (catalog):** `node --test backend/test/api.test.js` showed 404s for the absent search/detail/create/copy/archive handlers.
- **RED (reservations):** the reservation service test failed before implementation because `reservationService.js` was not present.
- **GREEN:** `npm run test:coverage` — 57 tests passed, 0 failed.
- **Frontend:** `npm run build --workspace frontend` — Vite production build succeeded.
- **Database contract:** `npx prisma validate --schema backend/prisma/schema.prisma` — schema valid; `npx prisma generate --schema backend/prisma/schema.prisma` generated Prisma Client.
- **Syntax:** `node --check backend/prisma/seed.js` and `node --check backend/src/server.js` — both passed.

## Test guarantees

| # | Guarantee | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Unauthenticated users cannot access staff data; members cannot access librarian-only operations | `backend/test/api.test.js`, `backend/test/authorization.test.js` | API/integration | PASS |
| 2 | Login creates an HttpOnly, SameSite session cookie; invalid credentials are rejected | `backend/test/api.test.js` | API/integration | PASS |
| 3 | Staff can load active member and available-copy choices, then issue a loan and receive a due date | `backend/test/api.test.js` | API/integration | PASS |
| 4 | Loan issue claims the copy, creates a loan, notification, and audit entry in one serializable transaction | `backend/test/loanService.test.js` | Service/unit | PASS |
| 5 | Staff can list loans; a member can only use the self-scoped loan-history endpoint | `backend/test/api.test.js` | API/integration | PASS |
| 6 | Staff can return active or overdue loans; inventory, notification, and audit changes are atomic | `backend/test/returnService.test.js`, `backend/test/api.test.js` | Service/API | PASS |
| 7 | Catalog list/detail is public, paginated, filter-validated, and omits the private digital-file URL | `backend/test/api.test.js` | API/integration | PASS |
| 8 | Resource create/update/archive and copy creation are restricted to staff and validated | `backend/test/api.test.js` | API/integration | PASS |
| 9 | Duplicate database values, invalid relations, and missing records yield safe HTTP errors | `backend/test/errors.test.js` | Unit | PASS |
| 10 | Inactive/non-member borrowers, unavailable copies, archived resources, malformed input, and competing issue/return updates are rejected | `backend/test/loanService.test.js`, `backend/test/returnService.test.js`, `backend/test/api.test.js` | Service/API | PASS |
| 11 | Unapproved origins and malformed JSON receive safe client errors | `backend/test/api.test.js` | API/integration | PASS |
| 12 | Members can reserve eligible physical resources; duplicate reservations and reservations for available/digital resources are rejected | `backend/test/reservationService.test.js`, `backend/test/api.test.js` | Service/API | PASS |
| 13 | Return, cancellation, and expiration promote FIFO waiters, reserve the copy, and notify the next member | `backend/test/reservationService.test.js`, `backend/test/returnService.test.js` | Service/unit | PASS |
| 14 | A ready reservation can be issued only to its member; members cannot cancel someone else's reservation; active reservations block archival | `backend/test/loanService.test.js`, `backend/test/reservationService.test.js`, `backend/test/api.test.js` | Service/API | PASS |

Coverage from the passing Node test-runner report: 93.36% lines, 81.54% branches, and 86.89% functions across exercised backend source files. Coverage is for these slices, not the complete specification. Tests use isolated Prisma-shaped fixtures; no real PostgreSQL server was configured, so actual migrations and seed execution remain unverified.

## Known gaps

Account administration, a general notifications inbox, analytics, reporting/CSV, password recovery, full OpenAPI documentation, deployed services, and a connected browser end-to-end workflow are not implemented in these slices.
