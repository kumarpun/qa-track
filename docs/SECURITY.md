# Security notes (Phase 6 review)

## Controls in place

| Area | Control |
| --- | --- |
| Authentication | bcrypt (cost 12), constant-time compare even for unknown emails, generic "Invalid email or password" error. Sessions are signed HS256 JWTs in an `httpOnly`, `sameSite=lax`, `secure` (production) cookie, 8 h lifetime. |
| Lockout | 5 failed sign-ins per submitted email within 15 minutes blocks further attempts (HTTP 429-style error) until the window passes. Counted per email whether or not the account exists, so lockout cannot be used to enumerate accounts. A successful sign-in clears the counter. Table: `login_attempts`. |
| Session validity | The user row is re-read on every request, so deactivation and role changes apply immediately; the JWT carries only the user id. |
| Authorization | Every mutation re-checks the role matrix on the server (`requireProject(projectId, action)`); UI hiding is cosmetic. `can()` throws on unknown actions (fail closed). Project roles are capped by the global role. Non-members get 404, not 403, so project ids cannot be probed. Record ids are always re-scoped to the owning project. |
| CSRF | Server Actions use Next.js's built-in Origin/Host check; cookies are `sameSite=lax`. `DELETE /api/attachments/[id]` is a route handler (no Origin check), protected by `sameSite=lax` plus the CORS preflight a cross-site DELETE needs. No state-changing GET routes; export downloads are read-only. |
| Guard sweep | Every Server Action in `app/actions/*` and every route handler (attachments, CSV/report exports) was checked to reach `requireProject(id, <action>)`, `requireGlobalRole("ADMIN")` or `requireUser()` (+ the `canCreateProject` check in the service) before any mutation, with the action string matching the matrix (defect delete → `defect.delete`, run status/create → `run.manage`, execution/comment → `run.execute`, suites/cases → `.write`). No misses. |
| Input | Zod validation on every action; all SQL is parameterised (`?` placeholders, `LIKE` wildcards escaped); no `dangerouslySetInnerHTML`; CSV export neutralises formula injection. |
| Uploads | Extension allow-list, 8 MB / 10 files limits, stored under a server-generated name outside the web root, served with `Content-Disposition: attachment` and `nosniff` after a project-membership check. |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed. |
| Secrets | `.env` is gitignored; only `.env.example` (placeholders) is tracked. DB credentials are never sent to the client (all DB code is `server-only`). |

## Known limitations / accepted risks
- Multi-tenancy: isolation is by `org_id` checks in the DAL/services (`requireProject` 404s foreign orgs, user lists and assignee/mention/owner lookups filter by org). No DB-level row security. Sign-up is open with no email verification or rate limiting; emails are globally unique, so sign-up reveals whether an email is registered.

- Lockout is per email, so someone who knows an email can lock that account for 15 minutes. Accepted trade-off versus brute force; there is no per-IP limit because `x-forwarded-for` is spoofable without a trusted proxy.
- No strict `script-src` CSP: Next.js injects inline scripts and a nonce setup was left out of scope. Frame embedding is blocked.
- Uploads are scanned by extension only (no antivirus / magic-byte check) and live on local disk.
- Sessions are stateless JWTs: signing out clears the cookie but a stolen token stays valid until expiry (the user-row check still blocks deactivated users). Rotating `AUTH_SECRET` invalidates all sessions.
- No MFA or password-reset flow.
