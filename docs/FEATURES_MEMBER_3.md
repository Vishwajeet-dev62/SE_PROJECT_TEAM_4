# Member 3 feature notes

Member 3's implementation covers authentication, account lockout, password
reset, task assignment, user administration, rate limiting, and security
auditing. Endpoints follow the shared contract (`/api/v1`, JSON, the standard
error and collection formats).

## Endpoints

| Endpoint | Access | Behavior |
|---|---|---|
| `POST /auth/register` | Public | `{ name, email, password }`; password policy: 8+ characters with letters and digits; returns `201` with the public user; duplicate email returns `409` |
| `POST /auth/login` | Public, rate limited | Returns `{ data: { accessToken, user } }`; every failure (unknown email, wrong password, inactive, locked) returns the same `401 INVALID_CREDENTIALS` |
| `POST /auth/logout` | Authenticated | Revokes the presented token until it expires |
| `GET /auth/me` | Authenticated | Returns the current public user |
| `POST /auth/forgot-password` | Public, rate limited | `{ email }`; always `202` with the same body |
| `POST /auth/reset-password` | Public, rate limited | `{ token, newPassword }`; `400 INVALID_RESET_TOKEN` for unknown, used or expired links |
| `GET /admin/users` | Administrator | Paginated user list; never includes password hashes |
| `POST /admin/users` | Administrator | `{ name, email, password, role? }`; creates an account (role defaults to `MEMBER`); duplicate email returns `409`; audited |
| `PATCH /admin/users/:id/status` | Administrator | `{ active: boolean }` |
| `PATCH /admin/users/:id/role` | Administrator | `{ role: "ADMIN" \| "MEMBER" }` |
| `PATCH /tasks/:id/assignment` | Creator, assignee, project owner or administrator | `{ assigned_to: <user id> \| null }` |

Rate-limited endpoints allow 10 requests per minute per IP and return `429
TOO_MANY_REQUESTS` afterwards. Login shares no counter with the password-reset
endpoints.

## Design decisions to record in the contract

These resolve items listed under "Decisions to confirm before implementation"
or fill gaps the contract leaves open. The team should confirm them.

- **JWT and logout:** 30-minute HS256 access token with a unique `jti`;
  logout stores the `jti` in `revoked_tokens` until expiry. There are no
  refresh tokens. SRS TM-SR-003 mentions 7-day refresh tokens; the recommended
  wording is: "Access tokens expire after 30 minutes and are revoked at logout
  and on password reset. Users sign in again after expiry. Refresh tokens are
  not used." Refresh tokens would add a rotating token store and a changed
  login flow in the frontend for little benefit in this application.
- **Lockout response:** a locked account gets the generic login error, so the
  API cannot be used to learn which accounts exist. The sign-in form tells
  everyone about the rule ("After 5 failed attempts your account is locked for
  15 minutes."). The recommended wording for SRS AC-TM-F-003 is: "The fifth
  consecutive failure locks the account for 15 minutes and records an audit
  event; the sign-in screen states the lockout rule."
- **Who may assign a task:** the task creator, the current assignee, the
  project owner, or an administrator. The assignee must be the project owner
  or a project member. `PATCH /tasks/:id` cannot change the assignee.
- **Administrator accounts:** an administrator cannot change their own role or
  status, so the system cannot be left without an administrator.
  `POST /admin/users` is a contract extension for SRS TM-F-041; the
  administrator sets the first password.
- **Password reset links:** 30 minutes, single use, only the newest link per
  user works; only a SHA-256 hash of the token is stored. A reset ends every
  earlier login session (`users.password_changed_at`, migration 016; the
  tolerance is one second).
- **Audit retention:** security events (the event types in `auditLog.js`) are
  deleted after 365 days by a daily job; other rows in the same table, such as
  task activity, are never deleted by it.
- **Proxy setting:** set `TRUST_PROXY` to the number of reverse proxies in
  front of the API so that per-IP rate limits see client addresses.

## Security audit events

`auditLog()` accepts a fixed list of event types and removes sensitive keys
(passwords, tokens, secrets, hashes) from the details. A failed audit write is
reported without details and never fails the request being audited. Failed
logins record a reason code only, not the submitted email.

## Known boundaries

- Password-reset email is sent by `emailSender.js` through SMTP when `SMTP_*`
  is configured. No test sends a real email, and the email does not go through
  `notificationService` as the contract describes. Without `SMTP_*`,
  development prints the link and production sends nothing.
- Task creation can still set an assignee without the assignment endpoint's
  notification.
- Task activity from Member 1 is still stored in `audit_logs`; security events
  and task history should move to separate tables. The retention job only
  touches security event types.
- Rate limits are per server instance; several instances need a shared store.
- The live checks (`npm run test:mysql:member3`) run against a disposable
  database only; see [REQUIREMENTS_TRACEABILITY.md](./REQUIREMENTS_TRACEABILITY.md)
  for the recorded run.
