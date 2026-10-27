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
- The frontend does not include login/registration UI or provide a token to
  its API client. Authenticated browser use of Member 2's features is
  therefore not yet integrated.
- The Kanban client calls the mounted Member 1 task `PATCH` route. That
  service enforces project access, archive state, and the shared task
  creator-or-assignee edit rule; the repository also enforces that rule
  atomically in the update query.
- `004_tasks.sql` is present before `005_comments.sql`. Migration tests
  validate ordering and runner behavior with a fake pool; they do not prove a
  live MySQL apply or persistence.
- The auth API currently implements register and login only; the contract's
  logout/revocation and `GET /auth/me` endpoints are not present.
- Pagination defaults, some data fields, and admin write policy remain
  proposals pending team confirmation as recorded in
  [integration proposals](./INTEGRATION_PROPOSALS.md).

## Verification evidence

Backend tests cover route validation/statuses, permission rules, archive
behavior, aggregation, task grouping, query parameterization, and migration
preconditions. Frontend tests cover API client behavior, project loading and
creation, dashboard rendering, board status calls/read-only state, and comment
create/edit/delete behavior. See the
[requirements traceability matrix](./REQUIREMENTS_TRACEABILITY.md).
