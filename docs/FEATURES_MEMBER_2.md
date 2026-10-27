# Member 2 feature notes

Member 2's implementation covers projects, project memberships, access
checks, dashboard aggregation, a Kanban presentation, and task comments. It
uses the shared API and database contract and does not substitute demo data
when the real service is unavailable.

## Access and archive policy

| Action | Project owner | Project member | Administrator |
|---|---:|---:|---:|
| Read accessible project, dashboard, board, members, comments | Yes | Yes | Yes |
| Edit project settings | Yes | No | No |
| Add/remove project members | Yes | No | No |
| Archive project | Yes | No | Yes |
| Edit own comment | Yes, if author | Yes, if author | Yes, if author |
| Delete own comment | Yes | Yes | Yes |
| Delete another user's comment | Yes | No | Yes |
| Change an archived project's data | No | No | No |

Archived project reads remain available; all relevant writes are rejected.
The application checks access against the task's actual project relationship,
not a client-supplied project identifier.

## Dashboard and Kanban

The dashboard reports active task counts for `TODO`, `IN_PROGRESS`, and
`DONE`, rounded completion percentage, and unfinished tasks overdue against
the UTC calendar date. The board reads the shared tasks repository and groups
active tasks into the shared statuses. Its response is paginated. Status
changes call Member 1's task endpoint; the backend does not duplicate task
write logic.

## Current integration boundaries

- The production server wires Member 3's JWT middleware and sets the
  authenticated `req.user`; protected project, task, and comment routes are
  mounted. No mock production identity is enabled.
- The frontend supports registration, sign-in, bearer-token API access,
  expiry handling, and sign-out. The token exists only in memory; refreshing
  the page requires signing in again.
- The Kanban client calls the mounted Member 1 task `PATCH` route. That
  service enforces project access, archive state, and the shared task
  creator-or-assignee edit rule; the repository also enforces that rule
  atomically in the update query.
- `004_tasks.sql` is present before `005_comments.sql`. Migration tests
  validate ordering and runner behavior with a fake pool. A separate live
  MySQL run applied all migrations and verified Member 2 persistence on
  2026-10-27.
- Logout revokes the presented JWT server-side through the
  `008_revoked_tokens.sql` table; `GET /auth/me` returns the current public
  user. Forgot/reset password and account-lockout behavior remain
  authentication-module requirements outside Member 2's feature ownership.
- Pagination defaults, some data fields, and admin write policy remain
  proposals pending team confirmation as recorded in
  [integration proposals](./INTEGRATION_PROPOSALS.md).

## Verification evidence

Backend tests cover route validation/statuses, JWT revocation, permission
rules, archive behavior, aggregation, task grouping, query parameterization,
and migration preconditions. Frontend tests cover authentication requests,
token forwarding/clearing, project loading and creation, dashboard rendering,
board status calls/read-only state, and comment create/edit/delete behavior. See the
[requirements traceability matrix](./REQUIREMENTS_TRACEABILITY.md).

Live verification on 2026-10-27 used real MySQL-backed HTTP requests and
separate owner, member, collaborator, outsider, and administrator accounts.
It verified project and membership operations, cross-project denials, task
status persistence, dashboard counts, comment permissions and pagination,
archive read-only behavior, and token revocation. Test records were removed;
the application tables were confirmed empty afterward. Project restoration
is not part of the shared contract; archiving is the defined lifecycle
operation.
