# Task Manager Application

The Task Manager is a React/Vite client and Node.js/Express API using MySQL.
This rebuild implements Member 2's projects, project membership, dashboard,
Kanban view, project access rules, and task comments against the shared
[integration contract](./docs/INTEGRATION_CONTRACT.md).

## Prerequisites

- Node.js 24 and npm
- MySQL 8 with InnoDB
- The shared `users` table from Member 3 and `tasks` table from Member 1 before
  applying Member 2's migrations

## Local setup

1. Create the local database and application user in MySQL.
2. Copy `.env.example` to `backend/.env`, then set the database credentials.
   Do not commit `.env` files.
3. Copy `frontend/.env.example` to `frontend/.env` if the API is not using the
   default `http://localhost:3000/api/v1` URL.
4. Install dependencies:

   ```powershell
   npm ci --prefix backend
   npm ci --prefix frontend
   ```

5. Apply migrations after the owning members' prerequisite tables exist:

   ```powershell
   Push-Location backend
   npm run migrate
   Pop-Location
   ```

6. Start the API and client in separate terminals:

   ```powershell
   Push-Location backend
   npm start
   ```

   ```powershell
   Push-Location frontend
   npm run dev
   ```

The API health endpoint is `http://localhost:3000/health`; the Vite client is
`http://localhost:5173`.

## Authentication integration status

The client supports account registration and sign-in using the backend's
`POST /api/v1/auth/register` and `/login` endpoints. Access tokens stay in
React memory, are sent as bearer authorization for protected requests, and
are not written to local or session storage. Sign-out calls the authenticated
`POST /api/v1/auth/logout`; the backend revokes that JWT until expiry.
`GET /api/v1/auth/me` returns the authenticated public user. A page refresh
requires signing in again.

The production server wires JWT authentication to project, task, and comment
routes. Project access and archived-project rules are enforced server-side;
task updates additionally require the task creator or assignee. The task
status endpoint used by the Kanban board is the shared
`PATCH /api/v1/tasks/:id` endpoint.

The complete migration sequence is `001_users.sql` through
`008_revoked_tokens.sql`. In addition to the automated migration-runner tests,
the full sequence was applied to an empty disposable MySQL database on
2026-10-27 and verified as idempotent on a second run. Live HTTP checks
exercised authentication, project and membership permissions, task/Kanban
persistence, dashboard aggregates, comments, archiving, foreign-key
enforcement, and logout revocation. Temporary records were removed and the
application tables were confirmed empty. This live verification was a
one-off run; the repository's automated migration tests still use a fake
pool.

Current cross-member assumptions and decisions are tracked in
[integration proposals](./docs/INTEGRATION_PROPOSALS.md). See the [Member 2
feature notes](./docs/FEATURES_MEMBER_2.md), [API reference](./docs/API.md),
[database notes](./docs/DATABASE.md), and [requirements traceability
matrix](./docs/REQUIREMENTS_TRACEABILITY.md).

## Validation

Run backend tests:

```powershell
Push-Location backend
npm test
Pop-Location
```

Run frontend tests, lint, and production build:

```powershell
Push-Location frontend
npm test
npm run lint
npm run build
Pop-Location
```

CI runs these checks on pull requests to `main`.

### Optional live MySQL integration test

The separate `backend` script exercises the real Express routes and MySQL
persistence. It does not run as part of `npm test` and never runs migrations.
First apply the documented migrations manually to an isolated database whose
name contains `test`, `testing`, or `disposable`. The script requires the
explicit `M2_MYSQL_INTEGRATION=1` opt-in, checks the selected database and
migration ledger, and removes only records matching its unique test markers.
It refuses ambiguous, production-looking, or non-test database names and
reports cleanup failures.

Run it only with approval to create and remove temporary test records:

```powershell
Push-Location backend
$env:M2_MYSQL_INTEGRATION = "1"
npm run test:mysql
Remove-Item Env:M2_MYSQL_INTEGRATION
Pop-Location
```

The live integration run on 2026-10-27 passed against an empty disposable
database. The checked-in guarded script was added afterward and has not itself
been run; ordinary unit tests do not verify its live MySQL behavior.
