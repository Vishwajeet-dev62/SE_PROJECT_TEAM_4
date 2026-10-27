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
| `006_audit_logs.sql` | Member 3 | `users` |
| `007_password_reset_tokens.sql` | Member 3 | `users` |
| `008_revoked_tokens.sql` | Authentication integration | `users` |

The shared migration runner applies numbered SQL files in lexical order,
records successful files in `schema_migrations`, checks migration
prerequisites, and serializes concurrent runs with a MySQL advisory lock.
Migrations are not wrapped in a transaction because MySQL DDL may implicitly
commit. All eight migration files, including the task-table migration required
by `005_comments.sql` and Member 2's board/dashboard queries, are present.
The automated test suite checks migration order and runner behavior using a
fake pool. Separately, on 2026-10-27, all eight migrations were applied to an
empty disposable MySQL database, and a second migration run reported that the
schema was up to date. The resulting nine InnoDB tables, expected indexes,
and eleven foreign keys were inspected through `information_schema`.

## Owned schema

- `projects`: owner, name, nullable description, archive state, and timestamps.
- `project_members`: composite `(project_id, user_id)` key, `OWNER`/`MEMBER`
  role, join timestamp, and foreign keys to projects/users. A project owner is
  also stored as a member.
- `comments`: task and author foreign keys, 5,000-character body, timestamps,
  and an index supporting ordered per-task pagination.
- `revoked_tokens`: JWT ID, user, and expiry for server-side logout. Expired
  revocation entries are pruned on logout and do not remain active.

The complete proposed ownership and field contract is in
[integration proposals](./INTEGRATION_PROPOSALS.md). IDs are exposed as
decimal strings. Database values are always passed as query parameters;
dynamic SQL is limited to a fixed allowlist of project update columns.

## Validation and local prerequisites

Repository tests exercise migration ordering, dependency checks, and the
runner using a fake MySQL pool; those tests are not live database evidence.
Live verification on 2026-10-27 used a disposable database with no pre-existing
tables or rows. It exercised registration/login, project CRUD, membership
changes and access checks, task creation and Kanban status persistence,
dashboard aggregates, comment CRUD/permissions, archive read-only behavior,
foreign-key rejection, and logout revocation through the actual MySQL-backed
Express services. Five temporary users, three projects, and four tasks were
removed after the run. A final row-count check found zero rows in application
tables; `schema_migrations` retains the eight applied migration records.

A dedicated `npm run test:mysql` script is separate from `npm test`. It
requires the explicit `M2_MYSQL_INTEGRATION=1` opt-in, a database name
containing `test`, `testing`, or `disposable` but not production-looking
markers, and the complete migration ledger. It never runs migrations and
refuses database writes if the marker or schema checks fail. It uses unique
records, cleans them in foreign-key-safe order, verifies cleanup, and reports
cleanup failures prominently.

The script was added after the successful one-off live run on 2026-10-27 and
has not itself been executed. Run it only with approval to create and remove
temporary records, against an isolated disposable database. Do not reset or
drop an existing database.
