# Reservation approval and pickup TDD evidence

## User journeys

Derived from the user's request; no plan file was used.

- As an administrator or librarian, I can approve the first waiting reservation when inventory is available, so the reserved copy is held for that member.
- As staff, I can confirm pickup to issue the held copy and fulfill the reservation.
- As a member, I can join the queue behind existing waiters even when copies are awaiting staff approval.
- As a member browsing a resource, I see no immediately borrowable copies while a queue is waiting for staff action.

## RED/GREEN evidence

- **RED:** Commit `d352a22` added the primary workflow regression tests. Commit `20eb29e` added edge-case tests. `npm run test --workspace backend -- test/reservationService.test.js test/api.test.js` executed 52 tests: 50 passed and the two new queue-policy tests failed for the expected reasons.
- **GREEN:** `npm run test --workspace backend -- test/reservationService.test.js test/api.test.js test/loanService.test.js test/returnService.test.js` — 69 tests passed, 0 failed.
- **Coverage:** `npm run test:coverage --workspace backend` — 88 tests passed, 0 failed; 94.45% lines, 84.14% branches, and 89.87% functions.
- **Frontend build:** `npm run build --workspace frontend` — Vite production build succeeded.
- **Diff hygiene:** `git diff --check` passed.

## Test guarantees

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | Only the first waiting reservation can be approved, and approval holds an available copy for 48 hours | `backend/test/reservationService.test.js` | Service/unit | PASS | `npm run test:coverage --workspace backend` |
| 2 | Staff can approve a waiting reservation through the API; members cannot call the staff action | `backend/test/api.test.js` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 3 | Members may join behind a waiting queue even when unassigned copies are awaiting approval | `backend/test/reservationService.test.js` | Service/unit | PASS | Focused workflow tests and coverage |
| 4 | Public resource details show zero immediately borrowable copies while reservations await staff approval | `backend/test/api.test.js` | API/integration | PASS | Focused workflow tests and coverage |
| 5 | Ordinary loans cannot bypass waiting reservations; returning, cancellation, and expiry leave the next waiter for staff approval | `backend/test/loanService.test.js`, `backend/test/returnService.test.js`, `backend/test/reservationService.test.js` | Service/unit | PASS | Focused workflow tests and coverage |
| 6 | The frontend production bundle compiles with staff approval and confirm-pickup actions | Frontend build | Build | PASS | `npm run build --workspace frontend` |

## Coverage and known gaps

No browser E2E test framework is configured, so the rendered staff-page interactions are covered by the production build and API/service tests rather than automated browser assertions. No database migration or production deployment was needed or performed.
