# Task Manager Test Cases - Part 3 Update

**Baseline:** Task Manager SRS v1.0, SAD v1.1, Software Test Plan v1.0, current repository implementation and test suite  
**Execution audit date:** 2026-11-15  
**Purpose:** Updated traceable test case inventory for the Part 3 deliverables. Results below describe the current automated run; historical live database notes elsewhere in the repository are not counted as a fresh execution.

## Execution legend

- **PASS (automated):** corresponding behavior is exercised by a checked-in test in the successful current run. This does not imply browser or live database validation.
- **NOT RUN:** requires a system environment, tool, data volume or user acceptance activity not exercised in this audit.
- **PARTIAL:** some automated behavior is verified, but the full SRS acceptance criterion needs additional system testing.

## Functional and security cases

| Case | Requirement | Priority | Procedure and expected result | Current evidence | Result |
|---|---|---:|---|---|---|
| TC-Auth-01 | TM-F-001 | High | Register with valid unique credentials, then try a duplicate email. Account is created once; duplicate is rejected; password is not returned. | `auth.test.js`, `AuthScreen.test.jsx` | PASS (automated) |
| TC-Auth-02 | TM-F-002 | High | Sign in, read current user, sign out, and reuse revoked token. Authenticated operations work; revoked token is rejected. | `auth.test.js`, `requireAuth.test.js`, `AuthScreen.test.jsx` | PASS (automated) |
| TC-Auth-03 | TM-F-003 | High | Submit five consecutive invalid passwords, then attempt valid sign-in while locked. Lockout and security audit event are recorded. | `auth.test.js`, `audit.test.js`, `userSchemaAlignment.test.js` | PASS (automated) |
| TC-Auth-04 | TM-F-004 | Medium | Request reset for known/unknown account; complete a reset token once; retry it. Response avoids account disclosure; token is single-use and secret values are not audited. | `passwordReset.test.js`, `sessionInvalidation.test.js`, `emailSender.test.js`, `AuthScreen.test.jsx` | PASS (automated; SMTP provider delivery not tested) |
| TC-Task-01 | TM-F-010 | High | Create task with valid fields and with an invalid/empty title. Valid task is persisted by service; invalid input receives validation error. | `taskService.test.js`, `taskValidation.test.js`, `taskValidationModule.test.js`, `ProjectTasks.test.jsx` | PASS (automated) |
| TC-Task-02 | TM-F-011 | High | Edit task fields as an authorized actor and attempt edit as an unauthorized actor. Authorized changes persist; unauthorized change is denied. | `taskService.test.js`, `taskApiProtection.test.js`, `ProjectTasks.test.jsx` | PASS (automated) |
| TC-Task-03 | TM-F-012 | Medium | Delete a task, list trash, restore it, and verify invalid/unauthorized operations are rejected. | `taskService.test.js`, `taskRepository.test.js`, `ProjectTasks.test.jsx` | PASS (automated) |
| TC-Task-04 | TM-F-013 | High | Change task status and verify updated status is returned and used by board grouping. | `taskService.test.js`, `taskServiceRoutes.test.js`, `ProjectBoard.test.jsx` | PASS (automated; UI-to-live-DB refresh not tested) |
| TC-Task-05 | TM-F-014 | High | Assign, reassign and unassign a task; try non-member and unauthorized assignments. Assignment rules and notification behavior are enforced. | `assignment.test.js`, `ProjectTasks.test.jsx` | PASS (automated) |
| TC-Proj-01 | TM-F-020 | High | Create, list, read, edit and archive projects with valid and invalid inputs. Service and route contracts return expected data/errors. | `projectService.test.js`, `routes.test.js`, `ProjectList.test.jsx`, `ProjectWorkspace.test.jsx` | PASS (automated) |
| TC-Proj-02 | TM-F-021 | Medium | Create and list a project category; validate rejected category inputs. | `categoryService.test.js`, `categoryRoutes.test.js`, `categoryRepository.test.js`, `ProjectTasks.test.jsx` | PASS (automated for category paths) |
| TC-Proj-03 | TM-F-021 | Medium | Create, list, update and remove tags and verify task tag associations. | No dedicated tag-service/repository test file is present in this checkout. | NOT RUN / coverage gap |
| TC-Srch-01 | TM-F-022 | High | Combine task search/filter/sort and pagination criteria. Returned rows and pagination reflect the query. | `taskService.test.js`, `taskRepository.test.js`, `ProjectTasks.test.jsx` | PARTIAL (automated API/UI paths; SRS two-second target not measured) |
| TC-Rem-01 | TM-F-023 | Medium | Schedule due and overdue task reminders; verify due-soon selection, delivery attempts, duplicate suppression and scheduler lifecycle. | `taskReminderService.test.js`, `taskReminderScheduler.test.js`, `taskReminderRepository.test.js` | PASS (automated; external email delivery not tested) |
| TC-Brd-01 | TM-F-030 | High | Load board tasks and group by status; move status and reload. Grouping and service update behavior are tested. | `ProjectBoard.test.jsx`, `taskService.test.js` | PARTIAL (automated components/services; no full browser/database round trip) |
| TC-Dash-01 | TM-F-031 | High | Load project dashboard totals, completion and overdue counts from task data. | `ProjectDashboard.test.jsx`, `projectService.test.js` | PASS (automated; no live DB query in this audit) |
| TC-Hist-01 | TM-F-032 | Medium | Record and list activity for project actions; verify parameterized persistence and response mapping. | `activityRepository.test.js`, `activityRoutes.test.js` | PASS (automated) |
| TC-Cmt-01 | TM-F-040 | Medium | List, add, edit and delete task comments under author/project permission rules. | `commentService.test.js`, `routes.test.js`, `TaskComments.test.jsx` | PASS (automated) |
| TC-Adm-01 | TM-F-041 | High | List users, change status and role; verify permissions, self-change protection and audit event. | `admin.test.js`, `requireAuth.test.js` | PASS (automated API; no administration UI exists) |
| TC-Exp-01 | TM-F-042 | Low | Export filtered tasks to CSV and verify export request and downloaded file handling. | `ProjectTasks.test.jsx` | PARTIAL (client behavior; spreadsheet opening/content interoperability not checked) |
| TC-Adm-02 | TM-F-043 | High | Request project resources as owner, member, admin and outsider. Outsider is denied without leaking project data. | `projectAccess.test.js`, `taskApiProtection.test.js`, `projectService.test.js` | PASS (automated) |
| TC-Sec-02 | TM-SR-002, TM-NF-003 | High | Register credentials and inspect hashing/response/audit behavior. Password is bcrypt hashed and is not exposed or logged. | `auth.test.js`, `audit.test.js`, `passwordReset.test.js` | PASS (automated; whole-database plaintext scan not performed) |
| TC-Sec-03 | TM-SR-003 | High | Check token expiry, logout revocation and token invalidation after password reset. | `auth.test.js`, `requireAuth.test.js`, `sessionInvalidation.test.js` | PARTIAL: 30-minute access token and revocation are tested; SRS 7-day refresh token is not implemented/tested |
| TC-Sec-04 | TM-SR-004 | High | Call protected/admin/project endpoints unauthenticated, as member/admin and across project boundaries. | `requireAuth.test.js`, `admin.test.js`, `projectAccess.test.js`, `taskApiProtection.test.js` | PASS (automated) |
| TC-Sec-05 | TM-SR-005 | High | Submit malformed values and inspect repository query parameterization and output handling. | `taskValidation.test.js`, `taskValidationModule.test.js`, `projectService.test.js`, repository tests | PARTIAL: automated validation/parameterized-query checks; ZAP, manual injection/XSS scan not run |
| TC-Sec-06 | TM-SR-006 | Medium | Exceed configured login and password-reset request limit in one minute. Excess request receives contract-formatted 429. | `rateLimit.test.js` | PASS (automated) |
| TC-Sec-07 | TM-SR-007 | Medium | Trigger security events and inspect audit data for required event and absence of secrets. | `audit.test.js`, `passwordReset.test.js`, `admin.test.js` | PARTIAL: event hygiene is tested; one-year retention is not verified |

## Non-functional and operational cases

| Case | Requirement | Acceptance target from SRS/Test Plan | Evidence in this audit | Result |
|---|---|---|---|---|
| TC-Perf-01 | TM-NF-001 | 95th percentile page under 2 s and API under 500 ms under 500 concurrent users (SRS) | No load generator/run or performance environment used. | NOT RUN |
| TC-Perf-02 | TM-NF-005 | 1,000 concurrent users and 100,000 tasks with <=20% response degradation | No load test performed. | NOT RUN |
| TC-OPS-01 | TM-NF-007 | Daily backup with RPO <=24 h; restore within 4 h | No backup/restore drill performed. | NOT RUN |
| TC-Comp-01 | TM-NF-006 | Current two releases of Chrome, Firefox, Edge and Safari | Automated tests use jsdom; no browser matrix run. | NOT RUN |
| TC-UX-01 | TM-NF-004 | Responsive desktop/tablet/mobile and WCAG 2.1 AA | No device/browser, Lighthouse, axe or manual keyboard audit run. | NOT RUN |
| TC-Rel-01 | TM-NF-002 | 99.5% monthly availability | No monitoring period/report supplied or generated. | NOT RUN |
| TC-Sec-01 | TM-SR-001 | TLS 1.2+ and HTTP-to-HTTPS behavior | No deployed TLS endpoint or SSL scan available. | NOT RUN |
| TC-DB-01 | System | Apply all migrations to disposable MySQL and verify integration/cleanup | A historical 2026-10-27 live run is documented in README; no live MySQL run was repeated for this audit. | NOT RUN in current audit |
| TC-UAT-01 | Acceptance | Product owner confirms acceptance suites and signs off | No product owner session or signed approval supplied. | NOT RUN |

## Execution notes

The initial test plan lists PostgreSQL 15 and Jest/Cypress/Selenium in its environment/tools section, while the current SRS and repository specify MySQL 8, React/Vite, Node/Express, Node's test runner, Vitest and Supertest. This update follows the current SRS and checked-in implementation. The Test Plan's stated schedule ended before this audit; results here were executed on 2026-11-15 and are not represented as tests run during 2026-11-02 to 2026-11-06. The exit criteria in the draft plan are not met because multiple planned cases remain not run and acceptance sign-off is absent.
