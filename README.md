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
| `npm run test:e2e` | Playwright (starts/reuses the dev server; needs seeded DB) |
| `npm run build` | production build |

## Status (Phase 1 complete)
Done: credentials auth (bcrypt, signed httpOnly session cookie), RBAC (Admin / QA Lead / QA Engineer / Viewer) enforced server-side, project CRUD + members + switcher, user admin, profile/password change, dashboard with real DB metrics and charts, collapsible sidebar, dark mode, breadcrumbs, audit-log writes, 19-table normalized schema.

Placeholders (later phases): test cases, suites, runs, execution, defects, reports.

## Known limitations
- No login rate limiting / lockout yet (planned Phase 6).
- E2E tests currently run against the configured database and create a project per run; a dedicated test database is planned.
- Global search currently targets test cases (module arrives in Phase 2).
