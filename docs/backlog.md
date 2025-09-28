# Deep Review Backlog

## Story vs. Task Terminology
- **Stories** describe end-to-end outcomes that deliver user-visible or systemic value. They frame the problem, outline the desired experience, and spell out how success is validated (tests, documentation, telemetry). Stories stay stable even if implementation steps evolve.
- **Tasks** break a story into concrete engineering steps. They capture focused deliverables (implement helper, add fixture, update docs) that collectively satisfy the parent story. Tasks can often be completed independently or in parallel.
- **Example:** Story 4.1 introduces CLI integration tests. Its tasks cover (a) building the reusable harness, (b) writing happy-path coverage, and (c) validating failure flows. Finishing the tasks demonstrates the story’s outcome.

## Recommended Epic Delivery Order

1. **Epic 4 – CLI usability and coverage:** Establishing the CLI harness (Story 4.1) is a prerequisite for validating later CLI UX, error handling, and roadmap stories. Landing it first gives us executable end-to-end coverage for anything that touches the command surface.
2. **Epic 2 – Importer determinism and guard rails:** With CLI coverage in place we can harden importer ordering, starting-balance handling, and mapping failures so downstream refactors and new features have a predictable foundation.
3. **Epic 6 – Testing & reliability:** Broaden error-path tests and log schema assertions while the importer changes are fresh. These suites will catch regressions introduced by the upcoming refactors.
4. **Epic 8 – Code quality and maintainability:** Break up brittle flows such as `Importer.importTransactions` and `ActualApi.runActualRequest` once determinism and test scaffolding exist, reducing complexity before pursuing roadmap features.
5. **Epic 5 – Observability and developer experience:** Layer in smoke scripts, defaulting logs, and contributor docs to make the preceding changes supportable and to keep new contributors productive.
6. **Epic 9 – Integration and tooling:** Extend lint/format coverage and onboarding once smoke scripts exist, and enable cognitive-complexity checks so the refactored code stays within agreed budgets.
7. **Epic 7 – CLI UX:** Improve discoverability and error messaging after the harness, importer guard rails, and observability improvements land, ensuring UX changes are measurable and well-instrumented.
8. **Epic 10 – Roadmap features:** Tackle multi-budget support, configurable data directories, and category translation last—each relies on the importer/CLI refactors and extended tooling to mitigate risk.

## Epic 1: Actual session lifecycle resilience

- **Epic Assessment:** ✅ Completed. The session lifecycle guardrails shipped across Stories 1.1–1.4 with regression coverage in `tests/ActualApi.test.ts`, so ongoing work can assume directory resolution, error surfacing, and logging are stable foundations.

### Story 1.1 – Resolve the Actual budget directory before `actual.init`
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** `ActualApi.loadBudget` now resolves the sync ID to an on-disk budget directory via `resolveBudgetDataDir`, ensuring `actual.init` operates against the correct path between runs.
- **Evidence:** The helper scans `metadata.json` files with defensive error handling and structured debug logs when a directory is selected. Regression coverage exercises multiple directory layouts (`tests/ActualApi.test.ts`).
- **Future Work:** None; follow-up improvements can iterate on the resolver directly in `src/utils/ActualApi.ts` if new edge cases appear.

### Story 1.2 – Surface actionable errors when a budget cannot be resolved
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** When no `syncId` match is found, the resolver throws an error that lists inspected directories. This prevents silently reusing the fallback data path.
- **Evidence:** Error messaging is asserted in `tests/ActualApi.test.ts`, and logger output captures the directories checked to aid debugging.
- **Future Work:** Consider tightening the inspected-directory cap (`MAX_DIRS_TO_SCAN`) if repositories with more than 100 entries appear.

### Story 1.3 – Guard session reinitialisation across sequential imports
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** Tests execute sequential imports across different budgets to ensure `ActualApi` reinitialises between runs and clears state after shutdown.
- **Evidence:** `tests/ActualApi.test.ts` asserts that `init`/`shutdown` pairs behave correctly and that distinct sync IDs do not leak data between runs.
- **Future Work:** Additional smoke coverage could validate the same behaviour via CLI integration once Story 4.1 lands.

### Story 1.4 – Log directory switches for observability
- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Context:** Structured debug logs such as `Using budget directory: <dir> for syncId <id>` are emitted whenever the resolver switches directories, making lifecycle transitions auditable.
- **Evidence:** Log assertions live in `tests/ActualApi.test.ts` and the behaviour is implemented in `src/utils/ActualApi.ts`.
- **Future Work:** None at this time.

## Epic 2: Importer determinism and guard rails

- **Epic Assessment:** 🚧 In progress (not yet started). Importer flows still rely on implicit ordering and best-effort warnings; landing Stories 2.1–2.3 will unlock confident refactors in Epics 8 and 10 by hardening transaction normalisation and mapping validation.

### Story 2.1 – Normalize MoneyMoney transactions before conversion
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `Importer.importTransactions` consumes the raw array from `moneymoney.getTransactions` without sorting. Deduplication relies on iteration order, which remains implicit.
- **Next Steps:**
  - Sort the transaction list by `valueDate` and a stable identifier (e.g., `id`) immediately after fetching.
  - Extend `tests/Importer.test.ts` with an unsorted fixture that verifies deterministic ordering and downstream balance calculations.
  - Confirm no regressions in synthetic starting-balance logic, especially around earliest import dates.
- **Key Files:** `src/utils/Importer.ts`, `tests/Importer.test.ts`.

### Story 2.2 – Extend starting balance coverage for missing booked transactions
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** The importer emits warnings when an Actual account lacks MoneyMoney transactions, but tests only cover presence/absence of transactions—not scenarios where MoneyMoney omits booked entries.
- **Next Steps:**
  - Add fixtures where MoneyMoney omits booked transactions but balances still imply a starting transaction.
  - Assert warning text, synthetic transaction amount, and generated memo (`Starting balance`) in `tests/Importer.test.ts`.
  - Ensure the logger hints align with contributor guidance (`Extend the date range...`).
- **Key Files:** `src/utils/Importer.ts`, `tests/Importer.test.ts`.

### Story 2.3 – Fail imports when account mapping resolution breaks
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `AccountMap.loadFromConfig` logs and skips unresolved mappings rather than failing fast, so `import` can proceed silently with partial coverage.
- **Next Steps:**
  - Make `loadFromConfig` throw when either side of a configured mapping cannot be resolved during an unconstrained import.
  - Add CLI-level tests (`tests/commands`) to assert the surfaced error message when mappings fail.
  - Document the failure mode in the README/backlog so operators know to fix configuration.
- **Key Files:** `src/utils/AccountMap.ts`, `tests/commands/import.command.test.ts` (new).

## Epic 3: Payee transformer resilience

- **Epic Assessment:** 🚧 Not started. The payee cache remains a weak point—without automatic healing or payload validation the importer risks stale payee names. Prioritising Stories 3.1–3.3 would reduce production incidents tied to corrupt OpenAI cache data.

### Story 3.1 – Heal corrupt payee cache entries automatically
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `PayeeTransformer` returns `null` if `openai-model-cache.json` cannot be parsed but leaves the corrupt file in place and provides no remediation logging.
- **Next Steps:**
  - When JSON parsing fails, delete the cache file and emit a warning noting the reset.
  - Add filesystem-mocked coverage to `tests/PayeeTransformer.test.ts` to ensure repeated runs recover gracefully.
- **Key Files:** `src/utils/PayeeTransformer.ts`, `tests/PayeeTransformer.test.ts`.

### Story 3.2 – Short-circuit on malformed OpenAI payloads
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** The transformer caches any parsed JSON object, even when the payload is empty or contains duplicate keys, leading to stale names being reused.
- **Next Steps:**
  - Detect empty payloads or duplicate keys and fall back to original payee names with a warning.
  - Extend tests with fixtures covering duplicate/empty responses to assert the fallback path and logging hints.
- **Key Files:** `src/utils/PayeeTransformer.ts`, `tests/PayeeTransformer.test.ts`.

### Story 3.3 – Emit structured timing metrics for payee transformation
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** The importer logs total transformation duration but not structured timing hints. There is no schema for downstream consumers to parse.
- **Next Steps:**
  - Extend `Logger` usage to emit a consistent object (e.g., start/end timestamps and elapsed ms) when `transformPayees` runs.
  - Add assertions in `tests/PayeeTransformer.test.ts` that log shape remains backward compatible.
  - Consider adding a metrics hook to bubble timing to CLI-level logs.
- **Key Files:** `src/utils/PayeeTransformer.ts`, `src/utils/Logger.ts`, `tests/PayeeTransformer.test.ts`.

## Epic 4: CLI usability and coverage

**Epic Assessment:** ✅ Completed. Stories 4.1–4.3 shipped the harness, option validation, and failure propagation coverage, so downstream work can rely on end-to-end CLI tests being available.

### Story 4.1 – Establish CLI integration tests for `import`
- **Complexity:** 8 pts
- **Status:** ✅ Done
- **Outcome:** CLI integration coverage now executes the compiled binary with a reusable harness. Tests simulate multiple servers, dry-run imports, and invalid account filters by injecting mock Actual/MoneyMoney layers via a custom loader.
- **Evidence:** `tests/helpers/cli.ts` builds the CLI once per run, `tests/helpers/cli-mock-loader.ts` records dependency usage, and `tests/commands/import.command.test.ts` asserts dry-run messaging, multi-budget imports, and error propagation.
- **Follow-up:** Future CLI stories can extend the harness with additional assertions (e.g., exit-code propagation, help output snapshots).

#### Task 4.1a – Build CLI test harness
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Notes:** Harness lives in `tests/helpers/cli.ts` and exposes `runCli`, `createCliEnv`, and `getCliEntrypoint` helpers that compile the CLI once and wire custom Node options.

#### Task 4.1b – Cover positive CLI flows
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Notes:** `tests/commands/import.command.test.ts` validates dry-run messaging, server/budget filtering, and successful execution across multiple budgets.

#### Task 4.1c – Exercise negative CLI paths
- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Notes:** CLI tests assert the mocked importer throws on unknown accounts and that the command exits with a non-zero code while still shutting down Actual connections.

### Story 4.2 – Clamp `--logLevel` via a yargs coercion hook
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Outcome:** The CLI now clamps `--logLevel` to the supported 0–3 range via a yargs coercion hook and throws with actionable
  guidance when non-numeric values are provided, preventing unsupported verbosity settings from leaking into commands.
- **Evidence:** `tests/commands/cli-options.command.test.ts` records the constructed logger level for high/low inputs, asserts the
  validation error path, and snapshots `--help` output so global option documentation stays in sync.
- **Follow-up:** None at this time.

### Story 4.3 – Propagate CLI exit codes for importer failures
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Outcome:** CLI integration coverage now forces importer failures and verifies the process exits with code `1`, confirming the `run().catch` boundary surfaces errors to callers instead of silently logging them.
- **Evidence:** `tests/commands/import.command.test.ts` asserts the mocked importer failure propagates to `stderr` and a non-zero exit code, while `tests/helpers/cli-mock-loader.ts` records the synthetic crash for debugging.
- **Follow-up:** None at this time.

## Epic 5: Observability and developer experience

- **Epic Assessment:** ✅ Completed. Configuration default logging now ships alongside consolidated local CI tooling and contributor documentation, so engineers have the observability and workflow guardrails envisioned for this epic.

### Story 5.1 – Log configuration defaulting decisions
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** `loadConfig` now returns structured defaulting metadata so commands can emit debug logs summarising which configuration values fell back to defaults.
- **Evidence:** `import.command.ts` logs default usage through `logDefaultedConfigDecisions` when DEBUG logging is enabled, and `tests/config.test.ts` covers metadata collection and log level gating.
- **Future Work:** Consider surfacing aggregated summaries once additional modules start consuming the default metadata.
- **Key Files:** `src/utils/config.ts`, `src/utils/Logger.ts`, `tests/config.test.ts`.

### Story 5.2 – Provide a consolidated `npm run smoke`
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** The repository already exposes the `npm run ci:local` helper, which chains the ESLint, Prettier, type-check, build, and test steps. Husky’s `pre-push` hook and the README’s development section direct contributors to the script, and the CI matrix mirrors the same gate coverage.
- **Evidence:** See the `ci:local` script in `package.json`, the development workflow guidance in `README.md`, and the quality matrix defined in `.github/workflows/ci.yml`.
- **Future Work:** Consider aliasing `npm run smoke` to `npm run ci:local` if contributors prefer the alternate naming, but no functionality gaps remain today.
- **Key Files:** `package.json`, `.github/workflows/ci.yml`, `README.md`.

### Story 5.3 – Document importer fixture workflow
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** The repository documents importer fixture expectations alongside the CLI harness instructions, and the CI workflow continues to execute the same suites to validate fixture health on every push and PR.
- **Evidence:** Guidance lives with the test harness documentation (`tests/helpers/cli.ts`, `tests/helpers/cli-mock-loader.ts`), and `.github/workflows/ci.yml` enforces the lint/type/build/test matrix that exercises the importer fixtures.
- **Future Work:** Expand the contributor docs if additional fixture types appear, but the current guidance and automation meet the epic’s requirements.
- **Key Files:** `README.md`, `.github/workflows/ci.yml`, `tests/helpers/`.

## Epic 6: Testing & Reliability

- **Epic Assessment:** 🚧 Not started. Current coverage skews to happy paths; extending fixtures and log schema checks via Stories 6.1–6.2 will mitigate regressions uncovered during recent bug reviews.

### Story 6.1 – Expand error-path coverage
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Existing tests focus on happy paths. There are no fixtures for network failures, malformed exports, or invalid credentials.
- **Next Steps:**
  - Build shared fixtures simulating network disconnects and credential errors at the API boundary.
  - Add importer-level tests for malformed MoneyMoney exports, asserting user-facing error messages.
  - Document new scenarios in testing docs for future contributors.
- **Key Files:** `tests/helpers/`, `tests/Importer.test.ts`, `docs/` (testing README).

#### Task 6.1a – Shared error fixtures
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Centralise fixtures/mocks to reuse across `ActualApi` and importer tests.

#### Task 6.1b – Malformed export tests
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Assert error messaging and ensure CLI surfaces actionable hints.

#### Task 6.1c – Document new failure scenarios
- **Complexity:** 1 pt
- **Status:** ⬜ Not started
- **Notes:** Update `docs/` (add a testing guide section) after fixtures land.

### Story 6.2 – Standardise debug log schema for observability
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Logs across modules vary in structure; no schema validation exists for tests to assert consistent JSON output.
- **Next Steps:**
  - Define a structured log shape (likely JSON objects) and update logger helpers to emit accordingly when a `structuredLogs` flag is enabled.
  - Update fixtures/tests to validate schema and ensure compatibility with existing log consumers.
- **Key Files:** `src/utils/Logger.ts`, `tests/` (log assertions), CI log parsing if applicable.

## Epic 7: CLI UX

- **Epic Assessment:** 🚧 Not started. User feedback still cites confusing `--help` output and opaque error messaging; the stories here depend on Epic 4’s harness to ensure improvements are tested once implemented.

### Story 7.1 – Improve command discoverability
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `--help` output lacks concrete examples for `import`, `sync`, or `resolve` workflows.
- **Next Steps:**
  - Augment command definitions with `.example()` entries demonstrating common usage.
  - Snapshot help output in tests to catch regressions when options change.
- **Key Files:** `src/index.ts`, `src/commands/*.ts`, `tests/commands`.

### Story 7.2 – Map backend errors to friendly CLI output
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Backend errors propagate raw messages. Although `ActualApi` has special handling for missing files, the CLI does not translate frequent errors into user-friendly text.
- **Next Steps:**
  - Introduce an error translation layer that maps common Actual server errors (`file-not-found`, `group-not-found`, HTTP 404) to actionable CLI messages.
  - Add integration tests verifying mappings stay in sync with `ActualApi.getFriendlyErrorMessage`.
- **Key Files:** `src/commands/import.command.ts`, `src/utils/ActualApi.ts`, `tests/commands`.

## Epic 8: Code quality and maintainability

- **Epic Assessment:** 🚧 Not started. High-complexity hotspots like `Importer.importTransactions` and `ActualApi.runActualRequest` remain brittle; executing these refactors will reduce risk before layering roadmap features.

### Story 8.1 – Refactor retry/resolution logic into reusable helpers
- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Budget directory resolution and retry logic live inline within `ActualApi`, making reuse difficult across commands.
- **Next Steps:**
  - Audit resolution touchpoints and design a helper API (likely in `src/utils/`) with strong typings.
  - Update importer/CLI callers to use the helper, adding regression tests for success and failure flows.
  - Document helper usage and update ADR/backlog notes accordingly.
- **Key Files:** `src/utils/ActualApi.ts`, `src/utils/shared.ts`, `tests/ActualApi.test.ts`, docs.

#### Task 8.1a – Draft helper API
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Capture configuration inputs/outputs and edge cases before refactoring existing code.

#### Task 8.1b – Adopt helper across callers
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Update importer and CLI modules, ensuring tests cover the refactored logic.

#### Task 8.1c – Document helper usage
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Update documentation/ADR once helper is established.

### Story 8.2 – Consolidate API error handling into a single class
- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** PostError and HTTP errors are handled ad hoc across modules, producing inconsistent messaging.
- **Next Steps:**
  - Define a unified error class encapsulating HTTP status, Actual error metadata, and user-facing messages.
  - Migrate CLI and logger usage to consume the new class, updating tests accordingly.
  - Document the hierarchy for future contributors.
- **Key Files:** `src/utils/ActualApi.ts`, `src/commands/import.command.ts`, `tests/ActualApi.test.ts`.

#### Task 8.2a – Define consolidated error shape
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Capture required fields (status code, reason, hint) and provide helper constructors.

#### Task 8.2b – Update consumers to use the new error class
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Refactor command modules, logger, and tests to leverage the unified error handling.

#### Task 8.2c – Document the new error hierarchy
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Add guidance to README/CONTRIBUTING for extending the error handling pattern.

### Story 8.3 – Decompose `Importer.importTransactions` into staged pipelines
- **Complexity:** 13 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `Importer.importTransactions` orchestrates fetching, filtering, mapping, and reconciliation in a single ~200 line method. The mix of async calls, logging, and state mutation makes it hard to reason about edge cases (e.g., dry-run, unchecked filters, synthetic balances) and increases regression risk when adding features like off-budget sync.
- **Next Steps:**
  - Map the responsibilities into discrete stages (fetch, filter, transform, reconcile, persist) and design composable helpers to isolate concerns.
  - Move pattern matching and transaction conversion into reusable modules with targeted unit tests so future changes (e.g., category translation) have narrow blast radius.
  - Add high-level integration coverage to ensure stage ordering remains correct and dry-run/real modes share behaviour except for side effects.
- **Key Files:** `src/utils/Importer.ts`, `tests/Importer.test.ts`, future CLI integration tests.

#### Task 8.3a – Define importer stage interfaces
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Document inputs/outputs for each stage and capture sequencing requirements (e.g., filtering before conversion) to guide refactor.

#### Task 8.3b – Extract filtering and transformation helpers
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Notes:** Implement new modules/functions for ignore pattern filtering and MoneyMoney → Actual transformation with focussed tests.

#### Task 8.3c – Introduce orchestration tests for dry-run vs. live modes
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Notes:** Add Vitest suites (and future CLI harness coverage) asserting both modes pass identical transaction batches to the API while only live mode mutates data.

### Story 8.4 – Simplify `ActualApi.runActualRequest` timeout handling
- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** The request wrapper coordinates timeouts, console patching, shutdown recovery, and friendly errors within one function. Nested promises and manual state resets are difficult to test, and regressions could leave the Actual client initialised incorrectly after timeouts.
- **Next Steps:**
  - Break timeout orchestration, console suppression, and error translation into dedicated utilities with deterministic unit tests.
  - Add targeted tests that simulate slow responses and thrown errors to confirm data dir state and logger output stay consistent.
  - Document extension points so new API operations reuse the simplified flow without duplicating timeout logic.
- **Key Files:** `src/utils/ActualApi.ts`, `tests/ActualApi.test.ts`.

#### Task 8.4a – Extract console patching & logging utilities
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Provide a helper that installs/removes console shims with predictable lifecycle hooks for tests.

#### Task 8.4b – Add timeout and shutdown resilience tests
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Use fake timers/mocks to assert that timeouts clear, shutdown is attempted once, and state flags reset on failure.

#### Task 8.4c – Refactor run wrapper to compose helpers
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Replace inline logic with the new helpers and update call sites to simplify future maintenance.

### Story 8.5 – Modularise CLI import orchestration
- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `handleCommand` inside `src/commands/import.command.ts` wires configuration parsing, validation, MoneyMoney checks, Actual session lifecycle, and nested server/budget loops in one function. The mixture of data shaping, error messaging, and control-flow flags (`dry-run`, filters) makes it brittle to extend (e.g., adding multi-budget sync telemetry) and difficult to test without duplicating setup in each scenario.
- **Next Steps:**
  - Extract pure helpers for parsing CLI filters, validating configuration selections, and iterating over servers/budgets so they can be unit tested independently.
  - Introduce higher-level orchestration that composes the helpers and coordinates lifecycle logging, keeping the command handler thin.
  - Backfill Vitest coverage for the new helpers plus CLI harness tests (after Story 4.1) to confirm dry-run, filter, and failure messaging remain unchanged.
- **Key Files:** `src/commands/import.command.ts`, `tests/commands/import.command.test.ts` (new helpers), `tests/helpers/cli.ts` (once harness exists).

#### Task 8.5a – Extract filter parsing & validation helpers
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Move server/budget/account/date parsing into dedicated utilities with explicit error messages and add unit tests covering invalid inputs.

#### Task 8.5b – Introduce lifecycle orchestration wrapper
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Implement a coordinator that iterates servers/budgets, instantiates dependencies, and handles shutdown with structured logging so the command handler delegates to it.

#### Task 8.5c – Cover CLI flows with new helpers
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Add targeted Vitest suites (and future CLI harness tests) verifying dry-run messaging, filter combinations, and shutdown resilience using the refactored helpers.

## Epic 9: Integration and tooling

- **Epic Assessment:** ⚖️ Partially complete. CI matrix enhancements (Story 9.1) are live, but onboarding docs and complexity linting remain gaps—finishing Stories 9.2–9.4 will round out the tooling experience.

### Story 9.1 – Expand CI coverage with linting, type-checking, and matrix builds
- **Complexity:** 13 pts
- **Status:** ✅ Done
- **Context:** `.github/workflows/ci.yml` defines a matrix over Node 20 and 22 running lint (ESLint + Prettier), type-check, build, and test jobs. Commitlint runs separately for commit hygiene.
- **Evidence:** Workflow steps invoke `npm run lint:eslint`, `npm run lint:prettier`, `npm run typecheck`, `npm run build`, and `npm test` with npm caching enabled.
- **Future Work:** None—monitor execution times and adjust the matrix if additional Node LTS versions are required.

#### Task 9.1a – Add ESLint and Prettier steps to CI
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Notes:** Implemented in the `quality` job with conditional steps per `matrix.task`.

#### Task 9.1b – Add a dedicated `tsc --noEmit` job
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Notes:** The matrix includes a `typecheck` task invoking `npm run typecheck`.

#### Task 9.1c – Configure GitHub Actions matrix builds for Node LTS
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Notes:** Node versions 20 and 22 run across all tasks with npm caching.

### Story 9.2 – Improve developer onboarding
- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Outcome:** Added a comprehensive `CONTRIBUTING.md`, refreshed the README with a developer onboarding section, and aligned the `.coderabbit` knowledge base with the new guidance.
- **Key Files:** `README.md`, `CONTRIBUTING.md`, `.coderabbit.yaml`.

### Story 9.3 – Enforce cyclomatic complexity budgets via ESLint
- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Outcome:** Added `eslint-plugin-sonarjs`-backed rules that cap function cyclomatic complexity at 40 and cognitive complexity at 60. The guard rails are available through `npm run lint:complexity`, which CI and the local smoke test invoke alongside the existing lint workflow.
- **Evidence:** `eslint.config.ts` gates the plugin via `ENABLE_COMPLEXITY_RULES`, `package.json` exposes the dedicated script, `.github/workflows/ci.yml` runs it in the lint matrix, and contributing docs explain how to respond to violations.
- **Follow-up:** Monitor importer-heavy functions; if budgets prove too strict, adjust thresholds with design discussion rather than disabling the rule ad hoc.

### Story 9.4 – Align lint and formatter coverage with active code paths
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `eslint.config.ts` only targets `src/**/*.ts`, leaving `tests/`, `scripts/`, and configuration files unchecked. Prettier scripts likewise scope to `src/`, so documentation, tests, and workflow files can diverge from agreed formatting or miss lint feedback until review time. Several utilities (e.g., CLI harnesses planned in Epic 4) will live outside `src/`, making the gap more pronounced as the repository grows.
- **Next Steps:**
  - Expand ESLint configuration to cover `tests/`, `scripts/`, and configuration TypeScript files while tuning rules (e.g., relaxed `no-unused-expressions`) where test ergonomics require it.
  - Broaden Prettier globs and add ignore files as needed so formatting applies consistently without touching generated artifacts.
  - Update npm scripts (`lint:eslint`, `lint:prettier`) and CI workflows to use the widened scope, ensuring local smoke checks stay aligned.
  - Document the new coverage expectations in `CONTRIBUTING.md`, including guidance for adding future directories to the lint/format scope.
- **Key Files:** `eslint.config.ts`, `.prettierignore`, `package.json`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`.

## Epic 10: Roadmap features

- **Epic Assessment:** These roadmap ideas align with user requests but each hinges on earlier refactors (Epics 2, 4, and 8) to reduce implementation risk. They should stay in discovery mode until we prototype configuration ergonomics and CLI harness coverage so we can prove the UX end-to-end without regressing existing stability work.

### Story 10.1 – Deliver multi-budget support with observability
- **Complexity:** 13 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** The importer processes one budget at a time per server. There is no persistence for multi-budget state beyond the existing configuration schema.
- **Assessment:** Ambitious but plausible once Epic 8 refactors land. Actual’s Node bindings support switching sync IDs, yet we would need design spikes to confirm cache invalidation, credential reuse, and logging expectations so we do not regress the session lifecycle work in Epic 1. High discovery risk remains around how operators expect to configure multiple budgets per server and how we surface partial failures in CLI output.
- **Next Steps:**
  - Model multi-budget configuration requirements and capture design notes covering edge cases.
  - Implement runtime support for switching budgets with tests across session lifecycles and logging enhancements.
  - Document multi-budget workflows for operators.
- **Key Files:** `src/commands/import.command.ts`, `src/utils/ActualApi.ts`, docs.

#### Task 10.1a – Model configuration and persistence
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Notes:** Draft ADR/design doc covering configuration schema updates and storage of per-budget metadata.

#### Task 10.1b – Implement runtime support and tests
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Notes:** Update importer/CLI flows with regression tests ensuring session resets between budgets.

#### Task 10.1c – Add telemetry and documentation
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Enhance logging and write user-facing docs explaining budget switching.

### Story 10.2 – Provide a configurable data directory override
- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `DEFAULT_DATA_DIR` is fixed; there is no CLI flag or environment variable to override the data directory.
- **Assessment:** Clear operator ask with manageable scope. We must audit all touchpoints that assume the default path (tests, docs, resolver helpers) and document how overrides interact with existing auto-discovery so that diagnostics (e.g., Story 1.2 error messages) remain accurate. Expect churn in onboarding docs but low technical risk once schema validation is in place.
- **Next Steps:**
  - Extend the configuration schema and CLI parsing to accept an override (via env var or flag) with validation.
  - Update integration tests/documentation to cover the new option and ensure backward compatibility.
  - Emit migration guidance for existing setups that rely on the default path.
- **Key Files:** `src/index.ts`, `src/utils/shared.ts`, `src/utils/config.ts`, docs, tests.

#### Task 10.2a – Extend configuration/CLI parsing
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Update Zod schema, CLI options, and default resolution logic.

#### Task 10.2b – Update tests and documentation
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Add coverage in config and CLI tests plus README/backlog updates.

#### Task 10.2c – Maintain backward compatibility guidance
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Document migration steps and ensure defaults remain unchanged unless overrides are provided.

### Story 10.3 – Sync off-budget account balances automatically
- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Off-budget accounts (e.g., investment portfolios) are ignored after initial import, so Actual balances drift as market values change in MoneyMoney.
- **Assessment:** Valuable for parity with MoneyMoney but requires careful design. MoneyMoney’s API only exposes point-in-time balances, so we must guarantee idempotent reconciliation entries and ensure we do not spam Actual with noise when markets fluctuate daily. Coordination with Story 8.3’s importer refactor feels mandatory to keep the pipeline understandable.
- **Next Steps:**
  - Expand the importer to fetch current balance snapshots for off-budget accounts and compare them with Actual’s recorded totals.
  - Generate reconciliation transactions that capture gains/losses with clear memos (`Off-budget balance sync`) and attach them to a configurable reconciliation category.
  - Expose CLI/config toggles to opt-in per account and document how the synthetic entries appear in Actual.
- **Key Files:** `src/utils/Importer.ts`, `src/utils/config.ts`, `src/commands/import.command.ts`, `tests/Importer.test.ts`, docs.

#### Task 10.3a – Model configuration for off-budget balance sync
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Allow accounts to opt into reconciliation, including category mapping and memo defaults.

#### Task 10.3b – Implement reconciliation transaction generation
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Extend importer logic to compute deltas, emit transactions, and ensure idempotency across runs.

#### Task 10.3c – Add tests and documentation for off-budget sync
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Cover positive/negative delta cases in unit tests and update README/backlog guidance for operators.

### Story 10.4 – Map MoneyMoney categories to Actual budget categories
- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Imports preserve MoneyMoney category names verbatim, leaving users to manually remap transactions in Actual even when MoneyMoney already applied rules.
- **Assessment:** Reasonable stretch goal once configuration ergonomics improve. Requires confirmation that we can reliably address Actual categories by stable IDs (not display names) and that MoneyMoney exports carry sufficient identifiers. We should prototype config ergonomics alongside Story 2.1’s normalisation so category lookups happen in a deterministic order.
- **Next Steps:**
  - Introduce an optional category translation table that resolves MoneyMoney category identifiers to Actual category IDs or names.
  - Update importer flows to apply translations with validation for unmapped categories and clear logging when fallbacks are used.
  - Provide configuration and CLI documentation showing how to enable, seed, and test the mapping.
- **Key Files:** `src/utils/Importer.ts`, `src/utils/config.ts`, `README.md`, `tests/Importer.test.ts`.

#### Task 10.4a – Define category translation configuration
- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Extend the config schema with optional mapping blocks and surface validation errors when categories are missing.

#### Task 10.4b – Apply translations and add coverage
- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Update importer logic/tests to apply mappings, ensuring unlisted categories fall back gracefully with warnings.

## Epic 11: TypeScript configuration parity

- **Epic Assessment:** ✅ Completed. The ESLint flat configuration now lives in `eslint.config.ts`, is executed via the TypeScript-aware loader in `package.json`, and removes the final `.mjs` entrypoint from the repository.

### Story 11.1 – Port ESLint configuration to TypeScript

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** The ESLint flat configuration has been rewritten in `eslint.config.ts` using `typescript-eslint`'s typed `config` helper so file globs and rule overrides benefit from editor inference.
- **Evidence:** `package.json` runs ESLint through Node's `ts-node` loader, ensuring the TypeScript module executes during local and CI lint jobs. The obsolete `eslint.config.mjs` file has been removed.
- **Future Work:** None. Additional lint surface can extend `eslint.config.ts` directly as new directories or rules are introduced.
- **Key Files:** `eslint.config.ts`, `package.json`.
