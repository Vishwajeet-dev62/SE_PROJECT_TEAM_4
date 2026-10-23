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

- Protected routes return `503 AUTHENTICATION_UNAVAILABLE` until Member 3's
  real JWT middleware and `req.user` contract are wired. No test identity or
  production mock auth is enabled.
- Kanban status persistence depends on Member 1's task `PATCH` route and
  `tasks` schema. The UI/API client call is implemented, but end-to-end task
  status persistence is not yet verified.
- Migration DDL depends on Member 1's `tasks` table. Although the migration
  runner expects it before `005_comments.sql`, no `004_tasks.sql` exists in the
  current tree. Local tests validate ordering and prerequisites, not a live
  MySQL apply.
- The legacy standalone Member 1 task server now fails closed with
  `503 API_NOT_CONFIGURED`; it must not be mounted for production use until
  authentication and project/task authorization are integrated.
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
