# Member 2 Integration Proposals

This document records the decisions supplied for this implementation and the
interfaces that still need confirmation from Members 1 and 3. It does not amend
the agreed [Integration Contract](./INTEGRATION_CONTRACT.md).

## Implementation decisions supplied by Pratik

- Project owners and administrators may archive projects.
- An archived project is read-only, including its tasks and comments.
- Comment authors may edit or delete their own comments.
- Project owners and administrators may delete any comment.
- No user, including an administrator, may edit another user's comment unless
  the team explicitly approves that additional permission.

These decisions are applied in the Member 2 implementation. The team should
record them in the shared contract before merging changes that affect other
members.

## Proposals pending Member 1/3 confirmation

### Authentication identity

Member 3's `requireAuth` should validate the JWT and attach:

```js
req.user = {
  id: "12",
  role: "MEMBER"
};
```

`id` is a decimal string to avoid JavaScript precision loss for
`BIGINT UNSIGNED`. Roles are `ADMIN` and `MEMBER`. `requireRole("ADMIN")`
should reject missing/invalid identity with `401` and insufficient role with
`403`. Member 2 does not issue, parse, or persist tokens. Until Member 3's real
middleware is integrated, production protected endpoints fail explicitly with
`503 AUTHENTICATION_UNAVAILABLE`; test-only identity injection is not enabled
in the production entry point.

### Project access middleware

Proposed reusable signature:

```js
requireProjectMember({ getProjectId: (req) => req.params.id })
```

The middleware should run after `requireAuth`, load the project, allow owners
and members to access it, and permit the administrator exception for reads.
It should attach the authorized project as `req.project`. Member 1's task
routes must resolve a task's `project_id` before checking membership; they must
not trust a client-supplied project ID in place of the task relationship.
Nested writes must also reject archived projects. This resolver signature and
administrator write permissions remain pending team confirmation.

For project settings and membership writes, this implementation allows the
project owner. Administrators may archive but may not edit settings or
membership through the Member 2 API. This least-privilege split is a proposal
pending team confirmation.

### Task and Kanban interface

The agreed task fields/statuses are used without creating a second task
service:

- `GET /api/v1/tasks?projectId=...&page=...&limit=...` supplies active project
  tasks to the board.
- `PATCH /api/v1/tasks/:id` with `{ "status": "TODO" | "IN_PROGRESS" | "DONE" }`
  persists a status change through Member 1's task API.
- Board reads may use the shared `tasks` table in a read-only repository query
  for `/api/v1/projects/:id/board`; status writes remain Member 1's
  responsibility.

The Kanban response is proposed as `{ "TODO": [], "IN_PROGRESS": [],
"DONE": [] }`. Cards use only the contract task fields. Member 1 must confirm
that status-only patches and the list response support this use.

### Database and JSON representation

The Member 2 migrations propose:

1. `001_users` — Member 3.
2. `002_projects` and `003_project_members` — Member 2.
3. `004_tasks` — Member 1.
4. `005_comments` — Member 2.

Projects have `id`, `owner_id`, `name`, `description`, `archived`,
`created_at`, and `updated_at`. Membership uses a unique `(project_id, user_id)`
key and a `member_role`; the owner is also represented as a project member.
Comments have `id`, `task_id`, `author_id`, `body`, and timestamps. Member 2
migrations reference, but do not create or alter, Member 1's `tasks` or Member
3's `users` tables.

API IDs are proposed as decimal strings. Dates/timestamps are ISO 8601 UTC.
Comment bodies are limited to 5,000 characters; project names to 150
characters; descriptions to 5,000 characters. The team should confirm these
limits and the exact project/comment JSON field names.

### Pagination

Proposed defaults are `page=1`, `limit=20`, and maximum `limit=100`. Responses
follow the shared contract:

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

The defaults and maximum remain pending team confirmation.

### Dashboard calculation

The proposed response is:

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

## Other open contract decisions

The shared contract also leaves category/tag scope, JWT expiry/revocation,
reminder delivery/retry, and the final project-access middleware signature
open. Member 2 does not decide or implement those Member 1/3 concerns.
