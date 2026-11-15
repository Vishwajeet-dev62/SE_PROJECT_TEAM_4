# Code Coverage Report - Part 3

**Execution date:** 2026-11-15  
**Tool:** Node.js built-in test coverage (`node --test --experimental-test-coverage`)  
**Scope:** Backend JavaScript files loaded during the complete backend test suite

## Measured result

| Metric | Measured coverage |
|---|---:|
| Lines | 67.86% |
| Functions | 83.38% |
| Branches | 80.52% |

The run completed with 282 tests passed and zero failed. These percentages are the actual aggregate reported by Node's test runner for files loaded in that run.

## Scope and interpretation

This is **backend-only loaded-file coverage**, not coverage of every source file in the repository. The report excludes frontend files: Vitest is installed, but its V8/Istanbul coverage provider is not in the committed frontend dependencies, so a frontend coverage percentage was not collected. Node's test runner does not count backend modules that were never loaded by tests as executed source. Consequently, the reported percentages must not be used to claim complete project coverage.

The source-level Node output shows uneven coverage across modules. Some controllers, routes, validation modules and service modules reached high or full measured coverage, while modules such as task/tag controllers and repositories and application service wiring have uncovered paths. The detailed per-file output was reviewed during this audit but is not a separate repository deliverable.

## Reproduction

From `backend/`, run:

```powershell
npm test -- --experimental-test-coverage
```

For frontend coverage, add and lock a compatible Vitest coverage provider in a separately reviewed dependency change, then rerun the frontend suite with coverage enabled. No dependency manifest was changed for this report.

See [BRANCH_COVERAGE_REPORT.md](./BRANCH_COVERAGE_REPORT.md) for branch coverage interpretation.
