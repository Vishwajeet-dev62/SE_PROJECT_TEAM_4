# Sprint 1 and Member 2 requirements assessment

Sprint 1 scope below is based on the repository's `sprint-1` GitHub issues:
TM-01 (#2), TM-03 (#4), and TM-04 (#5). TM-01 is shared; TM-03 is assigned to
Member 2; TM-04 is assigned to Member 3. The shared contract assigns projects,
membership, project access, Kanban, dashboard, and comments to Member 2, but
their feature issues are not labelled Sprint 1. They are not represented here
as approved Sprint 1 requirements. The source issue backlog has inconsistent
feature assignees compared with the shared ownership contract; the contract is
used for ownership.

| Requirement | Sprint 1 scope | Implementation evidence | Test evidence | Status | Remaining work |
|---|---|---|---|---|---|
| TM-01 repository structure, stack, test commands, and local setup | Confirmed; shared issue #2 | Root `README.md`, backend/frontend manifests and lockfiles, `.github/workflows/ci.yml` | Current checkout: backend 115 tests, frontend 25 tests; frontend lint/build pass; live disposable-MySQL API verification completed 2026-10-27 | Complete and locally verified | A full browser-authenticated MySQL UI demonstration and fresh GitHub Actions run were not performed. Existing local PDF deletions remain unstaged and must not be included in a PR. |
| TM-03 Express setup, health endpoint, and consistent errors | Confirmed; assigned to Member 2, issue #4 | `backend/server.js`, `backend/src/app.js`, `backend/src/middleware/errorHandler.js` | `backend/tests/app.test.js`; local `/health` startup smoke test | Complete and verified | The health endpoint is liveness-only; it does not prove MySQL connectivity. |
| TM-04 initial database schema | Confirmed; assigned to Member 3, issue #5 | `backend/migrations/001_users.sql` through `008_revoked_tokens.sql` | Automated migration tests plus live MySQL apply, idempotent rerun, table/index/FK metadata inspection on 2026-10-27 | Implemented and live schema verified | A guarded repeatable live-test script exists but was not run during this verification. |
| Project create/list/read/update (SRS TM-F-020) | Outside Sprint 1; Member 2 ownership is in the integration contract | Project service, repository, routes, JWT middleware, and project UI | Backend/frontend tests plus live MySQL-backed HTTP create/list/read/update/validation checks on 2026-10-27 | Implemented; live API/database verified | No project restore/delete endpoint is specified by the shared contract; archive is the lifecycle operation. |
| Membership, project access, ownership, and archive permissions (SRS TM-F-043; shared contract TM-SR-004) | Outside Sprint 1; TM-16 (GitHub issue #17) is assigned to Member 2 but has no Sprint 1 label | Project service, routes, JWT middleware, and `backend/src/middleware/projectAccess.js` | Backend/frontend tests plus live owner/member/collaborator/outsider/admin checks, membership removal and cross-project denial | Implemented; live API/database verified | None identified in the tested Member 2 access paths. |
| Archived projects are read-only (SRS TM-F-020) | Outside Sprint 1; shared contract rule | Project/comment services and repositories; board/member/comment UI controls | Backend/frontend tests plus live archive, idempotency, and rejected project/task/comment writes | Implemented; live API/database verified | Restoration is not specified by the shared contract. |
| Dashboard counts, completion percentage, and overdue tasks (SRS TM-F-031) | Outside Sprint 1; Member 2 ownership is in the integration contract | Project repository/service and dashboard component | Backend/frontend tests plus live database task fixtures verified status totals, 33% completion, and overdue count | Implemented; live query verified | None identified in the tested aggregation behavior. |
| Kanban task grouping and presentation (SRS TM-F-030) | Outside Sprint 1; Member 2 ownership is in the integration contract | Project repository/service and `frontend/src/features/board/ProjectBoard.jsx` | Backend/frontend tests plus live board grouping, pagination, and authorized-project checks | Implemented; live query verified | None identified in the tested board reads. |
| Kanban status persistence through task PATCH | Outside Sprint 1; task writes are Member 1's responsibility | Frontend client calls `PATCH /api/v1/tasks/:id`; production app wires the task service with JWT authentication and owner-or-assignee authorization | Frontend request tests plus live task update by assignee, unauthorized member denial, and direct persisted-status read | Integrated; live persistence verified | Browser UI was not connected to the live database during this run. |
| Comment list/create/edit/delete and permission rules (SRS TM-F-040) | Outside Sprint 1; Member 2 ownership is in the integration contract | Comment service/repository/controller and comments UI; `005_comments.sql` depends on `004_tasks.sql` | Backend/frontend tests plus live pagination, create/edit/delete, author-only edit, owner/admin delete, cross-project denial, and FK rejection checks | Implemented; live API/database verified | None identified in the tested comment operations. |
| Member 2 and auth integration MySQL migrations | Outside Sprint 1 for the Member 2 feature set | Project/membership/comment migrations plus `008_revoked_tokens.sql`; migration runner checks prerequisites | All eight migrations applied and verified; second run reported schema up to date; metadata showed nine InnoDB tables and eleven expected foreign keys | Implemented; live schema verified | Automated migration tests still use a fake pool. Guarded `npm run test:mysql` is available but was not run in this task. |
| No mock authentication or sample project/task data | Required integration rule in the shared contract | Production server wires `createRequireAuth`; frontend sign-in uses real API, memory-only JWT state, and explicit error states | Live registration/login, protected endpoint, logout revocation, and revoked-token rejection against MySQL-backed services | Implemented; live API/database verified | Full browser-authenticated UI/database demonstration was not run. |
| GitHub Actions validation | Confirmed by TM-01 and repository workflow | `.github/workflows/ci.yml` | Local backend/frontend tests, frontend lint and production build pass on this checkout | Locally verified | No fresh GitHub Actions run was checked during this execution. |

The automated Member 2 tests verify service rules, route behavior, in-memory
frontend authentication, token forwarding/revocation, and frontend feature
behavior. A separate live MySQL run completed on 2026-10-27 using an initially
empty disposable database. It applied and verified all migrations, exercised
the listed API persistence and authorization paths, and removed temporary
records. The migration ledger remains; all application tables were empty after
cleanup. A guarded repeatable integration script is now available as
`npm run test:mysql`; it was added after that live run and was not executed
during this task.
