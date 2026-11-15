# Branch Coverage Report - Part 3

**Execution date:** 2026-11-15  
**Tool:** Node.js built-in test coverage (`node --test --experimental-test-coverage`)  
**Scope:** Backend JavaScript files loaded during the complete backend test suite

## Measured result

| Metric | Result |
|---|---:|
| Backend branch coverage | 80.52% |
| Backend line coverage | 67.86% |
| Backend function coverage | 83.38% |
| Backend automated tests | 282 passed, 0 failed |

Branch coverage means the portion of instrumented conditional branches executed by the test run, as reported by Node's test runner. It is not a statement that all requirements, modules or front-end decision paths were tested.

## Limitations

Only backend files loaded during the test process contribute to this aggregate. Frontend branch coverage was not collected because a Vitest coverage provider is absent from the committed dependency set. Source modules not loaded by the run are outside this measurement. Uncovered backend branches remain, including error and optional-service paths identified in the detailed Node coverage output.

## Reproduction

From `backend/`, run:

```powershell
npm test -- --experimental-test-coverage
```

See [CODE_COVERAGE_REPORT.md](./CODE_COVERAGE_REPORT.md) for overall line/function context.
