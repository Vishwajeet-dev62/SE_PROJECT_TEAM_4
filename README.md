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

Protected backend routes require Member 3's real JWT middleware. Until that
middleware is integrated, protected routes intentionally return
`503 AUTHENTICATION_UNAVAILABLE`; the application does not enable a mock
identity or mock project/task data. Kanban status changes call Member 1's
`PATCH /api/v1/tasks/:id` endpoint and must be verified against that member's
task implementation before the feature is considered integrated.

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
