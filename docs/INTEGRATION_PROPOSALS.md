# Member 2 Integration Notes

This document records Member 2's implementation choices and integration
dependencies. The current
[Integration Contract](./INTEGRATION_CONTRACT.md) is authoritative; this
document does not amend it.

## Implementation decisions supplied by Pratik

- Project owners and administrators may archive projects.
- An archived project is read-only, including its tasks and comments.
- Comment authors may edit or delete their own comments.
- Project owners and administrators may delete any comment.
- No user, including an administrator, may edit another user's comment unless
  the team explicitly approves that additional permission.

These decisions are applied in the Member 2 implementation and align with the
confirmed project-archive and comment-moderation decisions in the shared
contract.

## Shared integration points

### Authentication identity

The production server creates Member 3's `requireAuth` middleware using the
configured JWT secret and user repository. It validates the JWT and attaches
the authenticated identity:

```js
req.user = {
  id: 12,
  role: "MEMBER"
};
```

Roles are `ADMIN` and `MEMBER`. Member 2 normalizes safe numeric IDs and
decimal-string IDs; decimal strings should be used for values outside
JavaScript's safe-integer range. The auth service issues 30-minute HS256
access tokens by default. The API implements register, login, logout with
server-side token revocation, and `GET /auth/me`. The frontend sends the
token from in-memory session state and does not persist it in browser storage;
test-only identity injection is not enabled in production.

### Project access middleware

The shared contract names the reusable `requireProjectMember(projectId)`
interface. Member 2's service currently enforces the same access checks on its
own routes and provides a resolver-based middleware helper for nested routes:

```js
const { requireProjectMember } = createProjectAccessMiddleware(projectService);
router.get("/:id", requireAuth, requireProjectMember((req) => req.params.id));
```

The helper must run after authentication, resolve the project from the
resource relationship, and reject writes to archived projects. Member 1's
task service resolves the task's `project_id` before checking membership; it
must not trust a client-supplied project ID in place of the task relationship.
Task updates also require the task creator or assigned user, with that
restriction enforced in the update query.

For project settings and membership writes, this implementation allows the
project owner. Administrators may archive but may not edit settings or
membership through the Member 2 API. This is the current least-privilege
behavior for team review.

### Task and Kanban interface

The merged task API and shared contract define the task resource. Member 2
does not create a second task service:

- The board reads active tasks directly from the shared `tasks` table.
- The client sends status-only changes to `PATCH /api/v1/tasks/:id`.
- Board reads may use the shared `tasks` table in a read-only repository query
  for `/api/v1/projects/:id/board`; task writes remain Member 1's
  responsibility.

The Kanban response follows the collection envelope, with grouped task arrays
inside `data`, for example:

```json
{
  "data": {
    "TODO": [],
    "IN_PROGRESS": [],
    "DONE": []
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

Cards use only the contract task fields. The task router is mounted by the configured production entry point behind
shared JWT authentication, and its service checks project access and
archived-project state. Task updates are restricted to the task creator or
assigned user. A live API test verified an assignee's status update persisted
in MySQL and that a non-assignee member was denied. The frontend board's
authenticated browser flow was not connected to the live database during
that verification.

### Database and JSON representation

The expected migration ordering is:

1. `001_users` — Member 3.
2. `002_projects` and `003_project_members` — Member 2.
3. `004_tasks` — Member 1 (present in the current repository).
4. `005_comments.sql` — Member 2.
5. `006_audit_logs.sql` and `007_password_reset_tokens.sql` — Member 3.
6. `008_revoked_tokens.sql` — authentication integration.

Projects have `id`, `owner_id`, `name`, `description`, `archived`,
`created_at`, and `updated_at`. Membership uses a unique `(project_id, user_id)`
key and a `member_role`; the owner is also represented as a project member.
Comments have `id`, `task_id`, `author_id`, `body`, and timestamps. Member 2
migrations reference, but do not create or alter, Member 1's `tasks` or Member
3's `users` tables.

API IDs are serialized as decimal strings to avoid JavaScript precision loss.
Dates/timestamps are ISO 8601 UTC.
Comment bodies are limited to 5,000 characters; project names to 150
characters; descriptions to 5,000 characters. Some project/comment JSON
fields are not specified in the shared contract and remain documented in the
API reference.

### Pagination

The shared contract confirms `page=1`, `limit=20`, and maximum `limit=100`.
Responses follow the shared contract:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

### Dashboard calculation

The Member 2 response is:

```json
{
  "countsByStatus": {
    "TODO": 0,
    "IN_PROGRESS": 0,
    "DONE": 0
  },
  "percentComplete": 0,
  "overdue": 0
}
```

`percentComplete` is `round(DONE / total * 100)`; it is `0` when there are no
active tasks. `overdue` counts active tasks whose due date is before the
current UTC date and whose status is not `DONE`.

## Remaining integration work

The shared contract records the category/tag scope, JWT session and
revocation policy, reminder behavior, pagination limits, and project-access
interface. The Member 2 UI now uses the backend JWT contract and logout
revocation. The migration set and project/task/comment persistence were
verified against disposable live MySQL on 2026-10-27. Password reset and
account lockout remain in Member 3's auth scope. The live verification was a
one-off run rather than a checked-in automated MySQL integration suite.
