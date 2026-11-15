# Unit Test Report - Part 3

**Project:** Task Manager Application  
**Execution date:** 2026-11-15  
**Branch:** `main`  
**Scope:** Current checked-in backend and frontend automated suites

## Result summary

| Suite | Command | Result |
|---|---|---:|
| Backend | `npm test -- --experimental-test-coverage` from `backend/` | 282 passed, 0 failed |
| Frontend | `npm test` from `frontend/` | 48 passed across 11 files, 0 failed |
| Combined automated tests | Both suites above | 330 passed, 0 failed |
| Frontend lint | `npm run lint` from `frontend/` | Passed |
| Frontend production build | `npm run build` from `frontend/` | Passed; Vite built 28 modules |

## Coverage result

The backend Node test runner reported 67.86% line, 83.38% function and 80.52% branch coverage for backend files loaded during the test run. This is not whole-repository coverage: the frontend Vitest coverage provider is not installed in the checked-in dependencies, and backend source modules not loaded by the test process are not represented as covered execution. See the separate code and branch reports.

## Scope exercised

The automated suites include authentication and session revocation, lockout and password reset, task validation/services/repositories/routes, project access and project services, assignment, categories, comments, activity, reminders, notifications, administration, rate limiting, migrations, and React UI/API behaviors for authentication, projects, tasks, dashboard, board, comments and notifications.

## Execution conditions and limitations

Dependencies were installed from the committed package lockfiles using `npm ci --ignore-scripts --no-audit --no-fund`. Backend route tests open ephemeral localhost listeners; the successful backend run was executed with permission for that local socket access. These unit and component tests use fakes, in-memory service wiring, or jsdom where applicable. They do not establish live MySQL, SMTP provider, deployed TLS, browser compatibility, accessibility, load, backup/recovery or UAT results.

The Part 3 test-case inventory is in [TEST_CASES.md](./TEST_CASES.md). No defects were inferred solely from untested requirements; coverage gaps and pending system checks are stated in the companion reports.
