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
  logout stores the `jti` in `revoked_tokens` until expiry. No refresh tokens
  (SRS TM-SR-003 mentions them).
- **Lockout response:** a locked account gets the generic login error, not a
  distinct lock message.
- **Who may assign a task:** the task creator, the current assignee, the
  project owner, or an administrator. The assignee must be the project owner
  or a project member.
- **Administrator safeguards:** an administrator cannot change their own role
  or status, so the system cannot be left without an administrator.
- **Password reset links:** 30 minutes, single use, only the newest link per
  user works; only a SHA-256 hash of the token is stored.

## Security audit events

`auditLog()` accepts a fixed list of event types and removes sensitive keys
(passwords, tokens, secrets, hashes) from the details. A failed audit write is
reported without details and never fails the request being audited. Failed
logins record a reason code only, not the submitted email.

## Known boundaries

- Password-reset email delivery is a temporary stand-in until Member 1's
  notification service can send email.
- Task activity from Member 1 is still stored in `audit_logs`; security events
  and task history should move to separate tables.
- No frontend exists for password reset, administration, or assignment.
- No live MySQL verification has been run for the features listed above;
  see [REQUIREMENTS_TRACEABILITY.md](./REQUIREMENTS_TRACEABILITY.md).
