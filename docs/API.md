# Member 2 API reference

All routes use `/api/v1`, JSON request and response bodies, and the common
error shape `{ "error": { "code": "...", "message": "..." } }`. Protected
routes require the shared JWT authentication middleware. They return
`503 AUTHENTICATION_UNAVAILABLE` until Member 3's middleware is integrated;
this is an explicit integration boundary, not an authentication substitute.

## Collection pagination

List routes accept `page` (default `1`) and `limit` (default `20`, maximum
`100`). Responses use:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0 }
}
```

Invalid, zero, negative, unsafe, or out-of-range pagination values return a
validation error.

## Projects

| Method and path | Behavior |
|---|---|
| `GET /projects?page=1&limit=20` | List projects visible to the authenticated user |
| `POST /projects` | Create a project; caller becomes owner and member |
| `GET /projects/:id` | Read project details and caller permissions |
| `PATCH /projects/:id` | Owner updates `name` and/or `description` |
| `POST /projects/:id/archive` | Owner or administrator archives the project |

Create and update accept `name` (trimmed, required on create, maximum 150
characters) and `description` (nullable, maximum 5,000 characters). Archive
returns the updated project with `archived: true`. Repeated archive requests
are idempotent. Writes to an archived project return
`409 ARCHIVED_PROJECT_READ_ONLY`.

## Membership

| Method and path | Behavior |
|---|---|
| `GET /projects/:id/members?page=1&limit=20` | List project members, including the owner |
| `POST /projects/:id/members` | Add a member with `{ "userId": "12" }` |
| `DELETE /projects/:id/members/:userId` | Remove a non-owner member (204 response) |

Only the owner may change membership. Adding a nonexistent user returns 404;
duplicate membership and attempts to remove the owner return 409. Admin read
access does not grant membership-management permission.

## Dashboard and board

`GET /projects/:id/dashboard` returns:

```json
{
  "data": {
    "countsByStatus": { "TODO": 0, "IN_PROGRESS": 0, "DONE": 0 },
    "percentComplete": 0,
    "overdue": 0
  }
}
```

Only active (not soft-deleted) tasks are counted. Completion is the rounded
percentage of `DONE` tasks; zero active tasks yields `0`. Overdue counts
unfinished tasks with a due date before the current UTC date.

`GET /projects/:id/board?page=1&limit=20` uses the collection envelope with
status-grouped task arrays in `data`:

```json
{
  "data": { "TODO": [], "IN_PROGRESS": [], "DONE": [] },
  "pagination": { "page": 1, "limit": 20, "total": 0 }
}
```

The board reads the shared `tasks` table; it does not create or update task
records. Status changes use Member 1's
`PATCH /api/v1/tasks/:id` with `{ "status": "TODO" | "IN_PROGRESS" | "DONE" }`.
The merged task router is not mounted by the rebuilt server until shared
authentication, project membership, and task ownership checks are connected.
Until then, task endpoint requests return an explicit `503 API_NOT_CONFIGURED`.
That cross-member write must be verified against Member 1's implementation.

## Comments

| Method and path | Behavior |
|---|---|
| `GET /tasks/:id/comments?page=1&limit=20` | List comments for an active, accessible task |
| `POST /tasks/:id/comments` | Add `{ "body": "..." }` |
| `PATCH /comments/:id` | Edit `{ "body": "..." }` when permitted |
| `DELETE /comments/:id` | Delete when permitted (204 response) |

Comment bodies are trimmed, required, and limited to 5,000 characters.
Authors may edit and delete their own comments. Project owners and
administrators may delete any comment; they cannot edit another user's
comment. Archived projects and soft-deleted tasks reject comment writes.
Unauthorized or inaccessible resources do not disclose their existence.

## Shared conventions

Identifiers are serialized as decimal strings to preserve MySQL
`BIGINT UNSIGNED` values in JavaScript. Timestamps use ISO 8601 UTC. See
[integration proposals](./INTEGRATION_PROPOSALS.md) for shared interface
decisions awaiting team confirmation.
