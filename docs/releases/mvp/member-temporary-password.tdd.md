# Member temporary password TDD evidence

## Source and user journey

Derived from the user's request; no plan file was used.

As a member given a temporary password, I can replace it at first sign-in and later change it again, so my account is secured with a password I choose.

## RED/GREEN evidence

- **RED checkpoints:** `2cb52ef` (`test: cover member temporary password change`) and `07a4e35` (`test: cover password-change login race`) are present on the current `main` branch. The original test-run output was not retained in the session handoff.
- **Continuation fix:** corrected the final assertion to read `updatedPasswordLogin`, the successful login response, rather than `newPasswordLogin`, which is intentionally rejected after a second password change.
- **GREEN:** `npm run test:coverage --workspace backend` — 78 tests passed, 0 failed.
- **Coverage:** 94.87% lines, 84.03% branches, and 89.33% functions across exercised backend source files.
- **Frontend:** `npm run build --workspace frontend` passed after the production-code changes. A browser mock flow also verified the forced reset, success state, and continuation to “My loans” (recorded in the session handoff; not rerun during this continuation).
- **Diff hygiene:** `git diff --check` passed.

## Test guarantees

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | A temporary-password member can sign in, sees the reset requirement, and is blocked from protected member features until changing the password | `backend/test/api.test.js: temporary member login exposes the reset requirement and blocks protected features` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 2 | Members can change a temporary or permanent password, cannot reuse the same password, and retain only the current session | `backend/test/api.test.js: members change temporary and permanent passwords and keep only the current session` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 3 | Invalid, weak, or oversized password changes are rejected | `backend/test/api.test.js: password changes reject weak and oversized passwords` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 4 | A login verified with a stale password cannot create a session after a concurrent password change | `backend/test/api.test.js: login does not create a session when the verified password changed concurrently` | API/integration | PASS | `npm run test:coverage --workspace backend` |
| 5 | Provisioned members require a first-login change; provisioned librarians do not | `backend/test/userProvisioningService.test.js` | Unit | PASS | `npm run test:coverage --workspace backend` |

## Coverage and deployment notes

Existing accounts keep the default `mustChangePassword = false`; newly provisioned members require a change. The Prisma migration has not been applied to a deployed database, and no production deployment was performed. Apply the migration and deploy the backend and frontend before expecting this behavior on Render.
