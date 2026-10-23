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

Member 3's `requireAuth` must validate the JWT and attach the authenticated
identity specified by the contract:

```js
req.user = {
  id: 12,
  role: "MEMBER"
};
```

Roles are `ADMIN` and `MEMBER`. Member 2 normalizes safe numeric IDs and
decimal-string IDs; decimal strings should be used for values outside
JavaScript's safe-integer range. Member 2 does not issue, parse, or persist
tokens. Until Member 3's real middleware is integrated, protected endpoints
fail explicitly with `503 AUTHENTICATION_UNAVAILABLE`; test-only identity
injection is not enabled in the production entry point.

### Project access middleware

The shared contract names the reusable `requireProjectMember(projectId)`
interface. Member 2's service currently enforces the same access checks on its
own routes and provides a resolver-based middleware helper for nested routes:

```js
const { requireProjectMember } = createProjectAccessMiddleware(projectService);
router.get("/:id", requireAuth, requireProjectMember((req) => req.params.id));
```

The helper must run after authentication, resolve the project from the
resource relationship, and reject writes to archived projects. Member 1's task
routes must resolve a task's `project_id` before checking membership; they
must not trust a client-supplied project ID in place of the task relationship.
The combined task routes still need this authorization wiring before they can
be mounted in the production server.

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

Cards use only the contract task fields. The merged task router is not mounted
in the configured production entry point. It lacks the shared authentication,
project-membership, and owner-or-assignee authorization wiring. The legacy
standalone task server now returns `503 API_NOT_CONFIGURED` rather than exposing
unauthenticated task writes. The client request is implemented, but status
persistence is not considered integrated until those checks and a live task
schema are available.

### Database and JSON representation

The expected migration ordering is:

1. `001_users` — Member 3.
2. `002_projects` and `003_project_members` — Member 2.
3. `004_tasks` — Member 1 (**not present in the current repository**).
4. `005_comments.sql` — Member 2.
5. `006_audit_logs.sql` and `007_password_reset_tokens.sql` — Member 3.

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

The shared contract now records the category/tag scope, JWT session and
revocation policy, reminder behavior, pagination limits, and project-access
interface. Remaining work is wiring Member 3's authentication into the
combined server, adding server-side project/task authorization to the task
routes, and verifying the migration set against Member 1's task schema and a
live MySQL instance.
