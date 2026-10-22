# Member 2 requirements traceability matrix

Status reflects this branch's evidence, not merged team integration. Shared
authentication, database ownership, and task writes remain dependent on the
owning members.

| Requirement | Implementation | Verification | Status |
|---|---|---|---|
| Create, list, read, and update projects | `backend/src/services/projectService.js`, project routes/controllers; `frontend/src/features/projects/ProjectList.jsx`, `ProjectWorkspace.jsx` | `backend/tests/projectService.test.js`, `backend/tests/routes.test.js`, `frontend/src/features/projects/ProjectList.test.jsx` | Implemented; authenticated runtime pending Member 3 |
| Project membership access checks | `projectService.js`, `projectRepository.js` | `backend/tests/projectService.test.js`, `backend/tests/repositories.test.js` | Implemented; authenticated runtime pending Member 3 |
| Owner/member/admin read policy and owner/admin archive | Project service and `backend/src/middleware/projectAccess.js` | `backend/tests/projectService.test.js`, `backend/tests/commentService.test.js` | Implemented; admin policy proposal pending team confirmation |
| Archived projects are read-only | Project service/repositories, comment service/repository, frontend board/member/comment controls | `backend/tests/projectService.test.js`, `backend/tests/repositories.test.js`, `backend/tests/commentService.test.js`, `frontend/src/features/board/ProjectBoard.test.jsx`, `frontend/src/features/comments/TaskComments.test.jsx` | Implemented |
| Dashboard counts, completion percentage, overdue count | Project repository/service and `frontend/src/features/dashboard/ProjectDashboard.jsx` | `backend/tests/projectService.test.js`, `backend/tests/repositories.test.js`, `frontend/src/features/dashboard/ProjectDashboard.test.jsx` | Implemented; live task schema pending Member 1 |
| Kanban grouping and status-only task updates | Project board repository/service; `frontend/src/features/board/ProjectBoard.jsx`; client calls `PATCH /api/v1/tasks/:id` | `backend/tests/projectService.test.js`, `backend/tests/repositories.test.js`, `frontend/src/features/board/ProjectBoard.test.jsx` | Grouping implemented; persistence awaits Member 1 endpoint and integration test |
| Comment list/create/edit/delete permissions | Comment service/repository/controller and `frontend/src/features/comments/TaskComments.jsx` | `backend/tests/commentService.test.js`, `backend/tests/routes.test.js`, `backend/tests/repositories.test.js`, `frontend/src/features/comments/TaskComments.test.jsx` | Implemented; authenticated runtime pending Member 3 |
| Parameterized MySQL persistence and owned migrations | `backend/src/repositories/`, `backend/migrations/002_projects.sql`, `003_project_members.sql`, `005_comments.sql` | `backend/tests/repositories.test.js`, `backend/tests/migrations.test.js` | Implemented; live migration awaits prerequisite tables |
| No production mock data or mock authentication | `backend/src/middleware/authenticationUnavailable.js`, real API client and explicit error states | `backend/tests/app.test.js`, `frontend/src/features/projects/ProjectList.test.jsx` | Implemented |
| CI and local validation | `.github/workflows/ci.yml`, root `README.md` | Backend: 41 tests; frontend: 18 tests, ESLint, Vite build | Implemented and locally verified |
