# Task Manager Application — Integration Contract

**Version:** 1.0  
**Status:** Initial agreed contract  
**Database:** MySQL with InnoDB  
**Backend:** Node.js + Express  
**Frontend:** React + Vite  
**API style:** REST with JSON  
**Authentication:** JWT

## 1. Purpose

This document defines the shared database schema, API conventions, authentication interfaces and integration rules for the Task Manager Application.

All team members must follow this contract when implementing their features. Changes to shared interfaces must be discussed and documented before implementation.

## 2. Feature ownership

| Member | Feature ownership |
|---|---|
| Member 1 | Task management, categories, tags, search, reminders, activity history, CSV export and notification service |
| Member 2 | Projects, project membership, Kanban board, dashboard, comments and project access checks |
| Member 3 | Authentication, account lockout, password reset, task assignment, administration and security auditing |

All members are responsible for their own frontend, backend, database interactions and tests.

## 3. Database conventions

- Use MySQL with the InnoDB storage engine.
- Use `BIGINT UNSIGNED` primary keys named `id` for main entities.
- Use foreign keys to maintain referential integrity.
- Store timestamps consistently in UTC.
- Use migrations to create and update the schema.
- Use parameterized queries; never concatenate untrusted input into SQL.
- Store password hashes, never plaintext passwords.
- Do not commit credentials, secrets or production environment files.
- Use `created_at` and `updated_at` where appropriate.

### 3.1 Tables

| Table | Purpose | Owner |
|---|---|---|
| `users` | Accounts, roles and login protection | Member 3 |
| `projects` | Project details and archive state | Member 2 |
| `project_members` | Project membership | Member 2 |
| `tasks` | Task details, assignment, status and soft deletion | Member 1 |
| `categories` | Task categories | Member 1 |
| `tags` | Task tags | Member 1 |
| `task_tags` | Task-to-tag relationship | Member 1 |
| `comments` | Task comments | Member 2 |
| `activity_logs` | User-visible task history | Member 1 |
| `audit_logs` | Security and administrative events | Member 3 |
| `notifications` | In-app notifications | Member 1 |
| `password_reset_tokens` | Password-reset token records | Member 3 |

### 3.2 Required relationships

- A user can own multiple projects.
- Users and projects have a many-to-many relationship through `project_members`.
- A project contains multiple tasks.
- Each task has a creator and may have an assignee.
- A task may have a category and multiple tags.
- A task can have multiple comments and activity records.
- A user can receive multiple notifications.
- Password-reset tokens belong to users.

Use foreign keys and suitable indexes for these relationships.

### 3.3 Task fields

The `tasks` table must include:

- `id`
- `project_id`
- `created_by`
- `assigned_to` (nullable)
- `category_id` (nullable)
- `title`
- `description` (nullable)
- `status`
- `priority`
- `due_date` (nullable)
- `deleted_at` (nullable)
- `created_at`
- `updated_at`

The title is required and has a maximum length of 150 characters.

Allowed status values:

- `TODO`
- `IN_PROGRESS`
- `DONE`

Allowed priority values:

- `LOW`
- `MEDIUM`
- `HIGH`

Task deletion is soft deletion. Restore is permitted within 30 days; expired deleted tasks must be purged by a scheduled job.

### 3.4 Account and project rules

- Global user roles are `ADMIN` and `MEMBER`.
- An assignee must belong to the task's project.
- Only authorized users may view or modify project data.
- Archived projects are read-only.
- Task editing must enforce the owner-or-assignee rule, along with project access restrictions.
- Account lockout occurs after five consecutive failed login attempts for 15 minutes.
- Password-reset links are single-use and expire after 30 minutes.

### 3.5 Activity and security logs

`activity_logs` records user-visible task events, including creation, edits, status changes, assignment, deletion and restoration.

`audit_logs` records security and administrative events, including failed logins, account lockouts, password resets and role changes.

These logs have different purposes and must remain logically separate.

## 4. API conventions

All API endpoints use the prefix:

`/api/v1`

Use JSON for request and response bodies unless an endpoint explicitly returns a file, such as CSV export.

Authenticated requests use:

`Authorization: Bearer <token>`

IDs are positive integers. Dates and timestamps use ISO 8601 format.

### 4.1 HTTP status codes

| Status | Meaning |
|---|---|
| `200 OK` | Successful read or update |
| `201 Created` | Resource created |
| `204 No Content` | Successful operation without a response body |
| `400 Bad Request` | Invalid input |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated user lacks permission |
| `404 Not Found` | Resource not found or unavailable |
| `409 Conflict` | Duplicate or conflicting operation |
| `500 Internal Server Error` | Unexpected server failure |

### 4.2 Error response format

All API errors should follow this structure:

    {
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Title is required",
        "details": {
          "title": "This field cannot be empty"
        }
      }
    }

The `details` field may be omitted when it is not applicable. Never expose stack traces, password hashes or secrets.

### 4.3 Collection response format

Collection endpoints return:

    {
      "data": [],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 0
      }
    }

Use pagination for potentially large collections. Agree on consistent defaults and maximum page sizes before implementing list endpoints.

## 5. Authentication endpoints — Member 3

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Register an account |
| `POST` | `/auth/login` | Authenticate a user |
| `POST` | `/auth/logout` | Invalidate the session |
| `POST` | `/auth/forgot-password` | Request a password-reset email |
| `POST` | `/auth/reset-password` | Reset using a valid token |
| `GET` | `/auth/me` | Return the authenticated user |

Registration accepts `name`, `email` and `password`.

The login and logout implementation must agree on token expiry and revocation. The selected approach must invalidate the session on logout rather than merely deleting the token in the frontend.

## 6. Task endpoints — Member 1

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/tasks` | List accessible tasks |
| `GET` | `/tasks/:id` | Retrieve a task |
| `POST` | `/tasks` | Create a task |
| `PATCH` | `/tasks/:id` | Update task fields |
| `DELETE` | `/tasks/:id` | Soft-delete a task |
| `GET` | `/tasks/deleted` | List restorable deleted tasks |
| `POST` | `/tasks/:id/restore` | Restore a task |
| `GET` | `/tasks/export` | Export filtered tasks as CSV |

Supported task-list filters include `projectId`, `status`, `priority`, `search`, `page` and `limit`.

Task operations must validate project membership, ownership and assignee permissions on the server.

## 7. Project endpoints — Member 2

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/projects` | List accessible projects |
| `GET` | `/projects/:id` | Retrieve a project |
| `POST` | `/projects` | Create a project |
| `PATCH` | `/projects/:id` | Update project details |
| `POST` | `/projects/:id/archive` | Archive a project |
| `GET` | `/projects/:id/members` | List members |
| `POST` | `/projects/:id/members` | Add a member |
| `DELETE` | `/projects/:id/members/:userId` | Remove a member |
| `GET` | `/projects/:id/dashboard` | Retrieve dashboard data |
| `GET` | `/projects/:id/board` | Retrieve Kanban board data |

Archived projects are read-only. The backend must enforce this rule for every relevant write operation.

## 8. Comments and assignment

### Comments — Member 2

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/tasks/:id/comments` | List comments |
| `POST` | `/tasks/:id/comments` | Add a comment |
| `PATCH` | `/comments/:id` | Edit a comment when permitted |
| `DELETE` | `/comments/:id` | Delete a comment when permitted |

### Assignment — Member 3

| Method | Endpoint | Purpose |
|---|---|---|
| `PATCH` | `/tasks/:id/assignment` | Assign or reassign a task |

Assignment must verify project membership and trigger the agreed notification service.

## 9. Administration — Member 3

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/admin/users` | List users |
| `PATCH` | `/admin/users/:id/status` | Activate or deactivate a user |
| `PATCH` | `/admin/users/:id/role` | Change a user's role |

These endpoints require administrator authorization. Administrative actions must be audited.

## 10. Notifications — Member 1

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/notifications` | List the current user's notifications |
| `PATCH` | `/notifications/:id/read` | Mark one notification as read |
| `PATCH` | `/notifications/read-all` | Mark all notifications as read |

The notification service is responsible for in-app notification creation and email delivery through the configured provider.

Member 3 calls the service for assignment and password-reset events. Scheduled task reminders are managed by Member 1.

## 11. Shared backend interfaces

The team agrees to the following responsibilities and interfaces.

### Authentication middleware — Member 3

`requireAuth` authenticates the request and attaches the current user to `req.user`.

Example:

    req.user = {
      id: 12,
      role: "MEMBER"
    };

`requireRole('ADMIN')` checks the global role.

### Project access — Member 2 and Member 3

`requireProjectMember(projectId)` must verify both authentication and project membership.

Member 3 provides identity and role checks. Member 2 implements the project-membership check. The team must agree on how the project ID is supplied to the middleware.

### Activity history — Member 1

`logActivity()` records task-related events. Members 2 and 3 call it when their operations cause relevant task changes.

### Security auditing — Member 3

`auditLog()` records security and administrative events. Other modules call it for relevant events, including task deletion and role changes.

### Notification service — Member 1

`notificationService` provides a shared interface for creating in-app notifications and sending email. Other modules request notifications through this interface rather than implementing their own email code.

### Scheduler — Member 1

Use one agreed scheduling setup for task reminders and the 30-day soft-delete purge. Ensure reminders are not repeatedly sent for the same scheduled event.

## 12. Integration rules

1. Each member owns their feature implementation, including UI, API, database interactions and tests.
2. Shared contracts must not be changed independently without team agreement.
3. Database changes must be made through migrations.
4. Temporary mocks and seed data must be replaced or verified against real integrations before a feature is marked complete.
5. All protected endpoints must enforce authorization on the backend.
6. Every feature must include tests for successful operations and important failure cases.
7. Changes to `main` must go through pull requests, review and passing required CI checks.
8. The RTM must be updated by each feature owner with implementation status and test evidence.
9. Unfinished requirements must remain marked as incomplete and be planned for a future sprint.

## 13. Decisions to confirm before implementation

The team must record its decisions on:

- Who can archive a project: project owner, administrator or both.
- Whether categories and tags are user-specific or project-specific.
- The JWT expiry and revocation mechanism used for logout.
- The reminder delivery and retry strategy.
- The precise permissions for editing and deleting comments.
- Pagination defaults and maximum page sizes.
- The agreed project-access middleware signature.

**This document defines the initial shared contract.** Once the team confirms the outstanding decisions, implement the database migrations and feature APIs against this version. Any later contract changes must be coordinated and documented.
