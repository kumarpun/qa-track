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

## Status (Phase 2 complete)
Phase 1: credentials auth (bcrypt, signed httpOnly session cookie), RBAC (Admin / QA Lead / QA Engineer / Viewer) enforced server-side, project CRUD + members + switcher, user admin, profile/password change, dashboard with real DB metrics and charts, collapsible sidebar, dark mode, breadcrumbs, audit-log writes, 19-table normalized schema.

Phase 2 (test cases): project-scoped codes (`TC-APP-0001`), steps (action / data / expected), immutable versions (every content edit creates a new version; restoring an old version creates a new one), version history, duplicate, archive/restore, bulk actions (archive, restore, assign, priority/type/automation), search / filter / sort with DB-level pagination, CSV import (dry-run preview) and export, audit entries.

Placeholders (later phases): suites, runs, execution, defects, reports.

### CSV format
One row per step. A row with a `title` starts a new case; following rows with only step columns add steps to it.
Columns: `code, title, description, preconditions, test_data, priority, type, automation, component, tags, requirement_url, assignee_email, step_action, step_data, step_expected`.
- `code` is ignored on import; new codes are assigned.
- `tags` are separated by `;` or `|`. Commas are not separators (they would break the CSV column).
- Import is all-or-nothing: every bad row is reported with its line number and nothing is written. Limits: 500 cases, 2 MB.
- Export prefixes cells starting with `= + - @` or tab with `'` to prevent spreadsheet formula injection; import strips it again, so round-trips are lossless.

## Known limitations
- No login rate limiting / lockout yet (planned Phase 6).
