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

Phase 2 (test cases): project-scoped codes (`TC-APP-0001`), steps (action / data / expected), edited in place (no version history), a pass/fail result history per case across runs, duplicate, permanent delete with confirmation (blocked for cases used in runs), bulk actions (delete, assign, priority/type/automation), search / filter / sort with DB-level pagination, CSV import (dry-run preview) and export, audit entries.

Phase 3 (suites and runs): nested test suites (many-to-many with cases, reorder, archive/restore, duplicate), run creation from suites and/or individually picked cases (`RUN-APP-0001`) with environment, build, platform, planned dates and testers. Each run **snapshots** every case (content + steps) at creation, so later case edits never change a run. Run list with search / status / environment / build filters and DB-level pagination; read-only run detail with per-status counts (Retest counts as pending, not passed). Creating runs needs QA Lead or Admin; managing suites needs QA Engineer or above.

Phase 4 (execution): open a run case to see its frozen snapshot, record Passed / Failed / Blocked / Skipped / Retest with optional per-step results, actual result, comment, defect links (existing, or "Report new defect" inline) and attachments. Failed requires an actual result. Every save appends an execution row (append-only history); the run case shows its latest status. Retest stays in the pass-rate denominator, so it never inflates the rate. Runs can be completed, cancelled or reopened (results are rejected while a run is closed). Comments per run case; `/execution` lists open runs. Executing needs QA Engineer or above; Viewers are read-only. QA Lead or Admin can permanently delete a run (any status) from its page: results, comments and attachments go with it and vanish from case history, reports and dashboard trend; defects stay.

Attachments are stored on local disk under `UPLOAD_DIR` (outside the web root, gitignored) with an extension allowlist (png, jpg, jpeg, gif, webp, pdf, txt, log, csv, json, mp4, webm, zip), 8 MB per file and 10 files per execution. Downloads go through `/api/attachments/:id`, which checks project membership, sends `nosniff` and a sandbox CSP, and only renders images inline.

Phase 5 (defects and reports): defects with project-scoped codes (`DEF-APP-0001`), full create / edit / detail / list (search, status / severity / priority / assignee filters, pagination), lifecycle statuses (Open, In progress, Fixed, Retest, Closed, Reopened; each change is audited), optional http(s)-only external URL (shown with `rel="noopener noreferrer"`). One defect can be linked from many executions; the detail page lists them. Deleting needs QA Lead or Admin and is refused while any execution is linked (close the defect instead). Reports page uses live DB data: totals, pass rate (Retest = pending), results by status, per-run table, defects by severity / status, top failing cases. Exports: `/defects/export` (honours list filters), `/reports/export?type=runs|cases|defects`; all cells are formula-injection safe. The **Print view** button prints the report with sidebar and header hidden. Writing defects needs QA Engineer or above; Viewers can read and export.

Phase 6 (audit and security): `/audit-log` (QA Lead: active project; Admin: everything) with action-prefix / entity / date filters and pagination; new `audit.read` permission. Sign-in lockout: 5 failed attempts per email in 15 minutes blocks further attempts for the window (`login_attempts` table, migration 002). Security headers, a full role × action permission-matrix unit test and E2E checks for audit access, lockout and headers. See [docs/SECURITY.md](docs/SECURITY.md) for the review and accepted risks.

### CSV format
One row per step. A row with a `title` starts a new case; following rows with only step columns add steps to it.
Columns: `TC ID, Module, Test Case, Description, Pre-conditions, Test Steps, Test Data, Expected Result, Priority, Test Type, Automation, Tags, Requirement URL, Assignee Email, Additional Test Data`. Header names are matched loosely (and the older snake_case names still work); required: Test Case, Test Steps, Expected Result. A template is served at `/templates/test-cases-import-template.csv`.
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
2. `npm run db:migrate` on every environment (migration 006 drops the case version history).
3. Do **not** run `db:seed` in production, or change the demo passwords immediately.
4. `npm run build && npm start`; put it behind HTTPS and persist `UPLOAD_DIR`.
- Global search (header) searches test cases of the active project only; runs and defects have their own list searches.

## @mentions and notifications

Type `@` in a comment (test case or run case) to pick a project member; the comment stores the mention as `@[Name](user-id)` and shows it as a chip. Mentioned users get an entry under the bell icon in the header (unread badge, refreshed every 60 s and on navigation); clicking it marks it read and opens the exact test case or run case. Rules: the author is never notified; only active project members (or Admins) are notified; one notification per comment and user, so editing a comment only notifies newly added mentions; deleting the comment removes its notifications (FK cascade). "Mark all read" clears the badge. Needs migration 009 (`node scripts/migrate.mjs`). Names are matched on submit, so two members with the same display name are ambiguous.

## Run a test case in a real browser

On a test case page, **Run in browser** opens a visible Chromium window on the machine running the server and executes the case's steps, then sets the case to Pass/Fail and stores a per-step log (plus a screenshot on failure) under *Browser runs*.

The same button on a **test suite** page runs every case in the suite one after another and shows a pass/fail summary; cases that are not runnable count as not passed and keep their status.

On a **run case** page (needs QA Engineer or above, run open), the same button runs the run's frozen snapshot steps and records the outcome as a normal execution (Passed/Failed, with the step log in the comment), so the run, reports and dashboard update like a manual result. Not-runnable cases are refused and nothing is recorded.

A **Visible / Headless** picker sits next to the button (remembered in your browser; `BROWSER_RUNS_HEADLESS=1` is no longer needed). Visible mode holds the window briefly and slows actions so you can watch.

Setup: `npx playwright install chromium`, set `ENABLE_BROWSER_RUNS=1` in `.env`, run `node scripts/migrate.mjs`. Local use only: the server visits URLs written in test cases, so keep it off elsewhere.

Steps must use this wording (one instruction per line, numbering optional, case-insensitive). Any other line makes the case "not runnable" and nothing is changed:

| Line | Meaning |
|---|---|
| `Visit` / `Open` / `Go to <url>` | open an http(s) URL |
| `Click` / `Select` / `Press <text>` | click a link, button or text; a trailing "button"/"link" is ignored (spacing/case ignored: `login` finds "Log in") |
| `Type <value> into <field>` or `Enter <field>: <value>` | fill an input found by label or placeholder; qualifiers like "invalid"/"valid" are ignored (`Enter invalid email format: x` fills the email input) |
| `Text should present: <text>` / `Should see <text>` | wait for text on the page |
| `Validation message: '<text>'` | text on the page, or an input's own browser validation message (expected result) |
| `Form does not submit` | the URL is unchanged after the last click (negative test; combine with `;`, e.g. `Validation message: 'Bad email'; form does not submit`) |
| `Should navigate to url: <url>` | the browser must be on that URL (put in *Expected result*) |

**Safety.** Steps never reach the database: they only drive the browser, and results are saved with parameterized queries. The browser runs in a fresh, cookie-less profile and can only visit public web pages. Requests to `localhost`, private/internal networks, cloud metadata (`169.254.x.x`) and `DB_HOST` are blocked, including redirects, subresources and hostnames that resolve to such addresses (`lib/server/automation/url-guard.js`). `BROWSER_RUNS_ALLOW_PRIVATE=1` re-allows loopback/private targets for testing a local site; metadata addresses and `DB_HOST` stay blocked.
