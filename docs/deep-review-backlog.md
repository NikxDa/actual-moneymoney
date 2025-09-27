# Deep Review

## Epic 1: Actual session lifecycle resilience
- [x] Story 1.1: Derive the Actual budget data directory before calling `actual.init` so `loadBudget` reinitializes sessions with the correct path; cover discovery of the `metadata.json` match in unit tests using multiple mock directories.
- [x] Story 1.2: Iterate every directory under the data root when resolving a budget `syncId` and surface an actionable error when none match instead of silently reusing the fallback path; add a regression test capturing the new error text.
- [x] Story 1.3: Add tests exercising sequential imports across different budgets to ensure `ActualApi` reinitializes between runs and does not leak session state after `shutdown`.
- [x] Story 1.4: Emit debug logging when Actual switches data directories so lifecycle transitions remain observable (e.g. `Using budget directory: <dir> for syncId <id>`).

## Epic 2: Importer determinism and guard rails
- Story 2.1: Normalize MoneyMoney transactions by sorting on value date and identifier before conversion so deduplication and starting balances behave deterministically; update importer tests with an unsorted fixture.
- Story 2.2: Extend starting balance coverage with a case where MoneyMoney omits booked transactions to verify the warning path and resulting synthetic transaction amount.
- Story 2.3: Make `AccountMap.loadFromConfig` fail the run when a configured mapping cannot resolve either side during an unconstrained import, and add CLI-level tests asserting the new error message.

## Epic 3: Payee transformer resilience
- Story 3.1: Guard the disk-backed OpenAI model cache against corrupt JSON by deleting the bad cache and logging the reset; verify behaviour with filesystem-mocked tests.
- Story 3.2: Short-circuit payee transformation when OpenAI returns duplicate keys or an empty payload so importers fall back to original names with a warning; add unit coverage for both scenarios.
- Story 3.3: Emit structured timing metrics (start/end timestamps) from `transformPayees` through the logger so callers can trace OpenAI latency, with tests asserting the additional hints.

## Epic 4: CLI usability and coverage
- Story 4.1: Introduce CLI integration tests for `import` covering server/budget filters, invalid account references, and dry-run success paths using the existing mock fixtures.
- Story 4.2: Validate the `--logLevel` flag via a yargs `coerce` hook that clamps values to the supported enum or fails fast with a helpful error; snapshot the help output to catch regressions.
- Story 4.3: Capture CLI exit-code behaviour for importer exceptions by asserting that non-zero statuses propagate to the shell when mocks throw, preventing silent failures in automation.

## Epic 5: Observability and developer experience
- Story 5.1: Emit structured debug logs when configuration parsing applies defaults, and add unit coverage ensuring the log level gate keeps noise from production runs.
- Story 5.2: Add a `npm run smoke` script that chains lint, typecheck, build, and tests locally, then document it in the README; wire it into CI as a single job to reduce duplication.
- Story 5.3: Provide a CONTRIBUTING guide section detailing how to update importer fixtures and record new VCR payloads, with checklist tests (Markdown lint or link check) to keep guidance fresh.
