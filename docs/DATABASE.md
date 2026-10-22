# Member 2 database notes

The application uses MySQL/InnoDB, parameterized queries, UTC timestamps, and
schema migrations. Member 2 owns `projects`, `project_members`, and `comments`;
the migrations intentionally reference Member 3's `users` and Member 1's
`tasks` tables rather than creating or altering them.

## Migration order and prerequisites

| Migration | Owner | Prerequisites |
|---|---|---|
| `001_users.sql` | Member 3 | None |
| `002_projects.sql` | Member 2 | `users` |
| `003_project_members.sql` | Member 2 | `users`, `projects` |
| `004_tasks.sql` | Member 1 | `users`, `projects` |
| `005_comments.sql` | Member 2 | `users`, `tasks` |

The shared migration runner applies numbered SQL files in lexical order,
records successful files in `schema_migrations`, checks Member 2 migration
prerequisites, and serializes concurrent runs with a MySQL advisory lock.
Migrations are not wrapped in a transaction because MySQL DDL may implicitly
commit. Create the prerequisite member-owned tables before running the runner.

## Owned schema

- `projects`: owner, name, nullable description, archive state, and timestamps.
- `project_members`: composite `(project_id, user_id)` key, `OWNER`/`MEMBER`
  role, join timestamp, and foreign keys to projects/users. A project owner is
  also stored as a member.
- `comments`: task and author foreign keys, 5,000-character body, timestamps,
  and an index supporting ordered per-task pagination.

The complete proposed ownership and field contract is in
[integration proposals](./INTEGRATION_PROPOSALS.md). IDs are exposed as
decimal strings. Database values are always passed as query parameters;
dynamic SQL is limited to a fixed allowlist of project update columns.

## Validation and local prerequisites

Repository tests exercise migration ordering, dependency checks, and the
runner using a fake MySQL pool. They do not apply DDL to a live MySQL instance.
The schema cannot be applied in isolation until Member 1's `tasks` and Member
3's `users` migrations are available. Verify the combined migration set against
the team's MySQL version before merging the integration branch.
