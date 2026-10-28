# TestTrack – Test Case Management & Test Run Platform

Next.js (App Router, JavaScript) + MySQL-compatible database (MySQL 8 / TiDB). No ORM: raw SQL via `mysql2`, hand-written migrations. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup
```bash
npm install
cp .env.example .env       # fill in DB_* and AUTH_SECRET (openssl rand -hex 32)
npm run db:setup           # creates DB if missing, applies migrations, seeds demo data
npm run dev                # http://localhost:3000
```
Demo logins (password `Passw0rd!demo`): `admin@example.com`, `lead@example.com`, `qa1@example.com`, `qa2@example.com`, `viewer@example.com`. **Remove/change before any real deployment.**

`DB_SSL=true` is required for TLS providers such as TiDB Cloud. Never commit `.env`.

## Scripts
| | |
|---|---|
| `npm run db:migrate` / `db:seed` / `db:setup` | schema + demo data |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright. Uses its own server (port 3100) and database `TEST_DB_NAME` (default `qa_platform_test`), which is migrated and seeded automatically; never touches `DB_NAME` |
| `npm run build` | production build |

## Status (all 7 phases complete)
Phase 1: credentials auth (bcrypt, signed httpOnly session cookie), RBAC (Admin / QA Lead / QA Engineer / Viewer) enforced server-side, project CRUD + members + switcher, user admin, profile/password change, dashboard with real DB metrics and charts, collapsible sidebar, dark mode, breadcrumbs, audit-log writes, 19-table normalized schema.

Phase 2 (test cases): project-scoped codes (`TC-APP-0001`), steps (action / data / expected), immutable versions (every content edit creates a new version; restoring an old version creates a new one), version history, duplicate, archive/restore, bulk actions (archive, restore, assign, priority/type/automation), search / filter / sort with DB-level pagination, CSV import (dry-run preview) and export, audit entries.

Phase 3 (suites and runs): nested test suites (many-to-many with cases, reorder, archive/restore, duplicate), run creation from suites and/or individually picked cases (`RUN-APP-0001`) with environment, build, platform, planned dates and testers. Each run **snapshots** the latest version of every case (content + steps) at creation, so later case edits never change a run. Run list with search / status / environment / build filters and DB-level pagination; read-only run detail with per-status counts (Retest counts as pending, not passed). Creating runs needs QA Lead or Admin; managing suites needs QA Engineer or above.

Phase 4 (execution): open a run case to see its frozen snapshot, record Passed / Failed / Blocked / Skipped / Retest with optional per-step results, actual result, comment, defect links (existing, or "Report new defect" inline) and attachments. Failed requires an actual result. Every save appends an execution row (append-only history); the run case shows its latest status. Retest stays in the pass-rate denominator, so it never inflates the rate. Runs can be completed, cancelled or reopened (results are rejected while a run is closed). Comments per run case; `/execution` lists open runs. Executing needs QA Engineer or above; Viewers are read-only.

Attachments are stored on local disk under `UPLOAD_DIR` (outside the web root, gitignored) with an extension allowlist (png, jpg, jpeg, gif, webp, pdf, txt, log, csv, json, mp4, webm, zip), 8 MB per file and 10 files per execution. Downloads go through `/api/attachments/:id`, which checks project membership, sends `nosniff` and a sandbox CSP, and only renders images inline.

Phase 5 (defects and reports): defects with project-scoped codes (`DEF-APP-0001`), full create / edit / detail / list (search, status / severity / priority / assignee filters, pagination), lifecycle statuses (Open, In progress, Fixed, Retest, Closed, Reopened; each change is audited), optional http(s)-only external URL (shown with `rel="noopener noreferrer"`). One defect can be linked from many executions; the detail page lists them. Deleting needs QA Lead or Admin and is refused while any execution is linked (close the defect instead). Reports page uses live DB data: totals, pass rate (Retest = pending), results by status, per-run table, defects by severity / status, top failing cases. Exports: `/defects/export` (honours list filters), `/reports/export?type=runs|cases|defects`; all cells are formula-injection safe. The **Print view** button prints the report with sidebar and header hidden. Writing defects needs QA Engineer or above; Viewers can read and export.

Phase 6 (audit and security): `/audit-log` (QA Lead: active project; Admin: everything) with action-prefix / entity / date filters and pagination; new `audit.read` permission. Sign-in lockout: 5 failed attempts per email in 15 minutes blocks further attempts for the window (`login_attempts` table, migration 002). Security headers, a full role × action permission-matrix unit test and E2E checks for audit access, lockout and headers. See [docs/SECURITY.md](docs/SECURITY.md) for the review and accepted risks.

### CSV format
One row per step. A row with a `title` starts a new case; following rows with only step columns add steps to it.
Columns: `code, title, description, preconditions, test_data, priority, type, automation, component, tags, requirement_url, assignee_email, step_action, step_data, step_expected`.
- `code` is ignored on import; new codes are assigned.
- `tags` are separated by `;` or `|`. Commas are not separators (they would break the CSV column).
- Import is all-or-nothing: every bad row is reported with its line number and nothing is written. Limits: 500 cases, 2 MB.
- Export prefixes cells starting with `= + - @` or tab with `'` to prevent spreadsheet formula injection; import strips it again, so round-trips are lossless.

## Known limitations
- Lockout is per email (not per IP) and can be triggered by anyone who knows an address; see docs/SECURITY.md.
- Sessions are stateless signed JWT cookies (8 h). There is no MFA, password reset or server-side session revocation.
- No strict `script-src` CSP (Next.js inline scripts); other security headers are set.
- Upload checks are extension/size based, and files are stored on local disk under `UPLOAD_DIR`. Use shared storage if you run more than one instance.
- Run-case assignee UI is not built; any non-viewer project member can execute a case, not only assigned testers.
- Comments are allowed on closed runs by design. Reports cover the 200 most recent runs.
- TiDB does not support `LOCK IN SHARE MODE`; code uses `FOR UPDATE`.

## Roles
| Role | Can |
|---|---|
| Admin | everything, including users and all projects |
| QA Lead | manage projects they belong to, create runs, delete defects, read the audit log |
| QA Engineer | write cases, suites, defects; execute runs and comment |
| Viewer | read and export only |

A global role caps project roles: a global Viewer listed as a project QA Lead stays read-only. Permissions are checked server-side in every Server Action and route handler (`lib/permissions.js`, `lib/server/dal.js`); hidden UI is never the only guard.

## Deploying
1. Provision a MySQL 8 / TiDB database and set `DB_*` (and `DB_SSL=true` for TLS) plus a fresh `AUTH_SECRET`.
2. `npm run db:migrate` on every environment (migration 002 adds `login_attempts`).
3. Do **not** run `db:seed` in production, or change the demo passwords immediately.
4. `npm run build && npm start`; put it behind HTTPS and persist `UPLOAD_DIR`.
- Global search (header) searches test cases of the active project only; runs and defects have their own list searches.
