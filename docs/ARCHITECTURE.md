# Architecture & Plan

## Stack
Next.js 16 (App Router, JavaScript, server components by default) · Tailwind + shadcn/ui (Base UI) · MySQL-compatible DB via `mysql2` (raw SQL, no ORM) · Zod · React Hook Form · Recharts · Sonner · Vitest · Playwright.

## Layers
- `app/` – routes. Pages are server components that call services directly; interactive bits are small client components.
- `app/actions/*` – server actions (`"use server"`). Each wraps `run(schema, input, fn)`: zod validation → service → `{ok,data}|{ok:false,error,fieldErrors}`.
- `lib/server/dal.js` – the **only** place authn/authz is decided (`requireUser`, `requireProject(projectId, action)`). `proxy.js` is an optimistic redirect only.
- `lib/server/services/*` – business logic and SQL. Take the already-authorized actor; write audit rows in the same transaction.
- `lib/permissions.js`, `lib/metrics.js` – pure, unit-tested (permission matrix; the single pass-rate/progress function used everywhere).
- `db/migrations/*.sql` + `scripts/migrate.mjs` – hand-written migrations, tracked in `_migrations`.

## Data integrity decisions
- Test case **versions** are immutable snapshots; every edit creates a new version.
- A **test run snapshots** case version + steps (`test_run_cases.snapshot`) at creation, so later edits never rewrite history.
- **Executions are append-only**; `test_run_cases.status` caches the latest.
- Historical tables use `ON DELETE RESTRICT`; "delete" is archive (`archived_at`).
- Codes (`TC-APP-0001`, `RUN-APP-0001`, `DEF-APP-0001`) come from per-project counters incremented inside the creating transaction (not AUTO_INCREMENT, which TiDB batches and leaves gaps in).
- **Retest** is *pending*: it is neither completed nor passed (see `lib/metrics.js`).
- Non-members get 404, not 403, so project IDs cannot be probed.

## Roadmap
| Phase | Scope | Status |
|---|---|---|
| 1 | Setup, schema, auth, layout, projects, users, dashboard shell | done |
| 2 | Test cases, steps, versions, CSV import/export, bulk actions | |
| 3 | Suites, run creation with snapshots | |
| 4 | Execution UI, attachments, comments, history | |
| 5 | Defects, reports, CSV/print | |
| 6 | Audit log UI, permission/security review, test suite | |
| 7 | Polish, docs | |
