# Digital Library Operations and Insights Management System

Student project built with React, Vite, Express, Prisma, and PostgreSQL. This workspace currently implements tested vertical slices for staff sign in and issue/return loans; member loan history and reservation queues; and a public catalog with title/author search and filtering, where staff can manage resources and physical copies.

## Architecture

- `frontend/`: React/Vite single-page application, Tailwind CSS, React Router, Axios, Recharts, and Lucide React.
- `backend/`: Express REST API under `/api/v1`, Zod validation, database-backed sessions, role checks, rate limiting, Helmet, and Prisma.
- `backend/prisma/`: PostgreSQL data model, initial migration, and synthetic seed records.
- Hosted target: Render Static Site + Render Free Web Service + Supabase Free PostgreSQL. Deployment has **not** been performed or verified.

Core relationships: `User` owns sessions, loans, reservations, notifications, and audit entries; `Resource` belongs to optional category/publisher records and has authors, physical copies, and reservations; a `Loan` relates a borrower, an issuing staff user, and one physical copy. Reservations are queued per resource. PostgreSQL partial unique indexes prevent duplicate active reservations for a member/resource, multiple simultaneous holds on one copy, and more than one outstanding loan for a copy. Reservation check constraints live in the initial SQL migration and are not expressible in the Prisma schema. Foreign keys preserve loan history.

## Implemented in this milestone

- Librarian sign-in using an opaque, random session token in an HttpOnly cookie. Only a SHA-256 hash of that token is stored in PostgreSQL.
- Backend authorization restricting member lookup, copy lookup, and loan issuance to administrators and librarians.
- Zod request validation, JSON body limits, allowlisted CORS/origin checks, Helmet headers, and login rate limiting.
- Transactional loan creation that verifies member status and resource/copy availability, claims the copy conditionally, creates an in-app notification, and writes an audit record.
- Transactional return processing that supports overdue loans, releases inventory, notifies the member, and writes an audit record.
- Staff active-loan list with return processing, plus a member loan endpoint scoped to the authenticated user.
- Member reservation queues with duplicate protection, cancellation, FIFO promotion on return, a 48-hour pickup hold, and activity-driven expiry processing. Staff can inspect ready reservations and issue the held copy only to its member.
- Reservation queue creation, cancellation, expiry, copy promotion, and loan fulfillment run in serializable database transactions; active reservations block resource archival.
- Public resource catalog with title/description/author search, format/category filters, pagination, resource details, and public metadata that omits private digital file links.
- Librarian resource management UI and API for creating/updating/archive catalog records and adding physical copies; archive preserves historical loan records.
- Responsive, keyboard-accessible login, catalog, member-loan view, and staff operations interfaces with loading, empty, success, and error states.
- Synthetic seed records only; no real student data.
- Backend API/service tests and a Prisma PostgreSQL schema/migration, including constraints/indexes and a partial unique index preventing concurrent active loans.

Full administrative user management, a general notifications inbox, analytics dashboards, reports/CSV, password recovery, complete OpenAPI documentation, and live deployment remain later implementation slices. This milestone is not a claim that the full specification is complete.

## Local development

Requirements: Node.js 20.19+ and npm. A PostgreSQL database is required; the API does not use in-memory storage as a substitute.

1. Create a Supabase project or use a local PostgreSQL database. Copy `backend\.env.example` to `backend\.env`.
2. Set `DATABASE_URL` to the PostgreSQL connection string. Keep the file private and never commit it.
3. Set unique `DEMO_LIBRARIAN_PASSWORD` and `DEMO_MEMBER_PASSWORD` values (at least 12 characters). The seed script will not run without both.
4. Install and prepare:

   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

5. Start both applications:

   ```powershell
   npm run dev
   ```

The frontend is served at `http://localhost:5173`; the API listens on port `4000`. Vite proxies `/api` requests to the local backend. `backend\.env.example` contains only placeholders. Change the demonstration passwords before seeding and do not use them for real accounts.

## API in this milestone

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | API health check |
| `POST` | `/api/v1/auth/login` | Public, rate-limited | Create a database-backed session |
| `POST` | `/api/v1/auth/logout` | Public | Revoke the current session, if present |
| `GET` | `/api/v1/auth/me` | Authenticated | Return the current user |
| `GET` | `/api/v1/users` | Admin/librarian | List active members for the loan desk |
| `GET` | `/api/v1/resources` | Public | Search/filter active catalog with page metadata |
| `GET` | `/api/v1/resources/:id` | Public | View active resource details; private digital URL omitted |
| `POST` | `/api/v1/resources` | Admin/librarian | Create a catalog record |
| `PATCH` | `/api/v1/resources/:id` | Admin/librarian | Update catalog metadata |
| `DELETE` | `/api/v1/resources/:id` | Admin/librarian | Archive a catalog record without deleting history |
| `GET` | `/api/v1/categories`, `/api/v1/authors`, `/api/v1/publishers` | Public | Read catalog filter/metadata values |
| `GET` | `/api/v1/resources/copies?status=AVAILABLE` | Admin/librarian | List active resource copies |
| `POST` | `/api/v1/resources/:id/copies` | Admin/librarian | Add a physical inventory copy |
| `POST` | `/api/v1/loans` | Admin/librarian | Issue a loan and update related records atomically |
| `GET` | `/api/v1/loans` | Admin/librarian | List loans with an optional status filter |
| `GET` | `/api/v1/loans/me` | Authenticated | List the current user's own loan history |
| `POST` | `/api/v1/loans/:id/return` | Admin/librarian | Process a return and release its copy atomically |
| `POST` | `/api/v1/reservations` | Member | Join the FIFO queue for a resource with no available copies |
| `GET` | `/api/v1/reservations/me` | Member | View and expire-check the current member's reservations |
| `GET` | `/api/v1/reservations` | Admin/librarian | Inspect reservation queues, optionally by status |
| `DELETE` | `/api/v1/reservations/:id` | Reservation owner or staff | Cancel a waiting/ready reservation and promote the next member |

Returns promote the next waiting member to `AVAILABLE`, reserve the returned copy for 48 hours, and create an in-app notification. Expired holds are released and promoted when a member or staff reservation list is requested. Staff loan issuance fulfills a ready hold only when the borrower matches the reserved member. Responses use `{ "data": ... }` on success and `{ "error": { "code": ..., "message": ... } }` on errors. Catalog list query supports `search`, `categoryId`, `authorId`, `resourceType`, `page`, and `limit`. The full endpoint set in the original specification is not implemented yet.

## Database and backups

Run `npm run db:migrate` for local development migrations. Use `npm run db:deploy` to apply committed migrations in a deployed environment. `npm run db:seed` inserts synthetic demonstration users, a resource, and a copy. Seeded data does not represent real students or library holdings.

Supabase Free currently lists up to two free projects, 500 MB database size per project, and 5 GB organization egress. Free projects with low activity may pause after seven days; Free does not include automatic daily backups. Make an off-site export before a demonstration or schema change. Example using PostgreSQL client tools:

```powershell
pg_dump "$env:DATABASE_URL" --no-owner --file .\library-backup.sql
```

Treat the export as sensitive data, store it privately, and do not commit it. Provider quotas and terms can change; verify them before deployment.

## Free-tier deployment guide

No hosting setup has been run. Do not claim a deployment is live until actual services and the health endpoint have been checked.

1. **Supabase:** create a Free project; copy the PostgreSQL connection string from the project’s Connect settings. Set it only as a backend environment variable. Use the provider’s SSL-enabled connection instructions. No database credential belongs in Vite variables or source control.
2. **Render API:** create a Node Web Service from the repository. Use root directory `.`, build command `npm install && npm run db:generate`, and start command `npm run start --workspace backend`. Set `NODE_ENV=production`, `DATABASE_URL`, `FRONTEND_ORIGIN` (the deployed static-site origin), `SESSION_COOKIE_NAME`, and `SESSION_TTL_DAYS` in the service environment. Run `npm run db:deploy` once the database is configured.
3. **Render frontend:** create a Static Site from the same repository. Use root directory `.`, build command `npm install && npm run build --workspace frontend`, and publish directory `frontend/dist`. Set `VITE_API_BASE_URL` to the API URL plus `/api/v1` (for example `https://your-api.onrender.com/api/v1`). Add a rewrite from `/*` to `/index.html` for client-side routing.
4. Set the backend `FRONTEND_ORIGIN` to the exact `https://...onrender.com` frontend origin. Redeploy after changing frontend build variables, then verify the frontend login screen, API health endpoint, and an authorized loan workflow.
5. If seeding a hosted demonstration database is needed, configure `DEMO_LIBRARIAN_EMAIL`, `DEMO_LIBRARIAN_PASSWORD`, and `DEMO_MEMBER_PASSWORD` in a trusted local backend environment, then run `npm run db:seed`. Never expose seed passwords or database credentials in browser variables, logs, screenshots, or source control.

Free-tier caveats checked against vendor documentation on 28 October 2026:

- Render Free Web Services sleep after 15 minutes without inbound traffic and may take about a minute to start again. Free service filesystems are ephemeral; do not store persistent uploads there. Free instance hours and build/bandwidth allowances are limited.
- Render Static Sites are free, but workspace bandwidth/build limits apply.
- Supabase Free projects may pause after inactivity and have no automatic daily backups. Keep manual exports.
- The reviewed vendor documentation did not establish a definitive payment-method requirement for these free plans. Do not enter payment information or enable a paid upgrade without explicit approval.
- These services can change or pause free-tier features. Do not assume continuous availability for a timed school presentation; visit the service shortly before presenting and keep a local PostgreSQL backup/restore option.

Official references:

- [Render free instances](https://render.com/docs/free)
- [Render static sites](https://render.com/docs/static-sites)
- [Render build pipeline](https://render.com/docs/build-pipeline)
- [Render outbound bandwidth](https://render.com/docs/outbound-bandwidth)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase billing and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)

## Verification

```powershell
npm run test
npm run test:coverage
npm run build
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/library"
npx prisma validate --schema backend/prisma/schema.prisma
```

The automated API tests use isolated Prisma-shaped fixtures. Applying migrations, seeding, and running the application against PostgreSQL still requires a configured database. The audit identifies a high-severity issue in Prisma 6's development CLI transitive `deepmerge-ts` dependency (stack exhaustion on recursive input); production application dependencies are not affected by this CLI-only package. The available automatic fix requires a Prisma major upgrade, so the project currently pins Prisma 6 pending a separately tested upgrade or an upstream patched compatible release.
