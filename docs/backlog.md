# Deep Review Backlog

## Story vs. Task Terminology

- **Stories** describe end-to-end outcomes that deliver user-visible or systemic
  value. They frame the problem, outline the desired experience, and spell out
  how success is validated (tests, documentation, telemetry). Stories stay
  stable even if implementation steps evolve.
- **Tasks** break a story into concrete engineering steps. They capture focused
  deliverables (implement helper, add fixture, update docs) that collectively
  satisfy the parent story. Tasks can often be completed independently or in
  parallel.
- **Example:** Story 4.1 introduces CLI integration tests. Its tasks cover (a)
  building the reusable harness, (b) writing happy-path coverage, and (c)
  validating failure flows. Finishing the tasks demonstrates the story’s
  outcome.

## Roadmap

The roadmap table only lists epics that still require planning or delivery work. When an epic lands, move its row to the [epic archive](#epic-archive) so this view stays focused on upcoming priorities. Every entry links to the detailed write-up below for additional context.

| Order | Epic | State | Notes |
| --- | --- | --- | --- |
| 1 | [**Epic 8 – Code quality and maintainability**](#epic-8-code-quality-and-maintainability) | 🚧 Not started | Break up brittle flows such as `Importer.importTransactions` and `ActualApi.runActualRequest` once determinism and test scaffolding exist, reducing complexity before pursuing roadmap features. |
| 2 | [**Epic 7 – CLI UX**](#epic-7-cli-ux) | 🚧 Not started | Improve discoverability and error messaging after the harness, importer guard rails, and observability improvements land, ensuring UX changes are measurable and well-instrumented. |
| 3 | [**Epic 10 – Multi-budget support with observability**](#epic-10-multi-budget-support-with-observability) | 🧭 Discovery mode | Prototype configuration ergonomics, cache invalidation, and logging before attempting multi-budget imports so we do not regress the session lifecycle work. |
| 4 | [**Epic 11 – Configurable data directory override**](#epic-11-configurable-data-directory-override) | 🧭 Discovery mode | Align schema, CLI parsing, and docs around a data-directory override once importer refactors land, keeping diagnostics trustworthy. |
| 5 | [**Epic 12 – Off-budget balance synchronisation**](#epic-12-off-budget-balance-synchronisation) | 🧭 Discovery mode | Model reconciliation workflows that update off-budget accounts without spamming Actual, coordinating with importer refactors for determinism. |
| 6 | [**Epic 13 – MoneyMoney category translation**](#epic-13-moneymoney-category-translation) | 🧭 Discovery mode | Validate identifier stability and config ergonomics before translating categories so imports remain auditable. |

### Epic archive

| Order | Epic | State | Notes |
| --- | --- | --- | --- |
| 1 | [**Epic 4 – CLI usability and coverage**](#epic-4-cli-usability-and-coverage) | ✅ Done | The CLI harness, option validation, and failure propagation stories shipped, so downstream work can assume end-to-end coverage already exists for anything that touches the command surface. |
| 2 | [**Epic 2 – Importer determinism and guard rails**](#epic-2-importer-determinism-and-guard-rails) | ✅ Done | CLI coverage and mapping failure guards ship together, so imports now fail fast when configuration drifts instead of proceeding with partial coverage. |
| 3 | [**Epic 6 – Testing & reliability**](#epic-6-testing--reliability) | ✅ Done | Error-path fixtures, malformed export guards, and structured logging are complete, keeping the CLI observable and resilient under test. |
| 4 | [**Epic 5 – Observability and developer experience**](#epic-5-observability-and-developer-experience) | ✅ Done | Smoke coverage, default logging, and contributor docs are live, giving follow-on epics the observability and workflow guard rails they depend on. |
| 5 | [**Epic 9 – Integration and tooling**](#epic-9-integration-and-tooling) | ✅ Done | Lint/format coverage and onboarding improvements shipped alongside cognitive-complexity checks so the refactored code stays within agreed budgets. |

## Epic 1: Actual session lifecycle resilience

- **Epic Assessment:** ✅ Done. The session lifecycle guardrails shipped
  across Stories 1.1–1.4 with regression coverage in `tests/ActualApi.test.ts`,
  so ongoing work can assume directory resolution, error surfacing, and logging
  are stable foundations.

### Story 1.1 – Resolve the Actual budget directory before `actual.init`

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** `ActualApi.loadBudget` now resolves the sync ID to an on-disk
  budget directory via `resolveBudgetDataDir`, ensuring `actual.init` operates
  against the correct path between runs.
- **Evidence:** The helper scans `metadata.json` files with defensive error
  handling and structured debug logs when a directory is selected. Regression
  coverage exercises multiple directory layouts (`tests/ActualApi.test.ts`).
- **Future Work:** None; follow-up improvements can iterate on the resolver
  directly in `src/utils/ActualApi.ts` if new edge cases appear.

### Story 1.2 – Surface actionable errors when a budget cannot be resolved

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** When no `syncId` match is found, the resolver throws an error
  that lists inspected directories. This prevents silently reusing the fallback
  data path.
- **Evidence:** Error messaging is asserted in `tests/ActualApi.test.ts`, and
  logger output captures the directories checked to aid debugging.
- **Future Work:** Consider tightening the inspected-directory cap
  (`MAX_DIRS_TO_SCAN`) if repositories with more than 100 entries appear.

### Story 1.3 – Guard session reinitialisation across sequential imports

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** Tests execute sequential imports across different budgets to
  ensure `ActualApi` reinitialises between runs and clears state after shutdown.
- **Evidence:** `tests/ActualApi.test.ts` asserts that `init`/`shutdown` pairs
  behave correctly and that distinct sync IDs do not leak data between runs.
- **Future Work:** Additional smoke coverage could validate the same behaviour
  via CLI integration once Story 4.1 lands.

### Story 1.4 – Log directory switches for observability

- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Context:** Structured debug logs such as
  `Using budget directory: <dir> for syncId <id>` are emitted whenever the
  resolver switches directories, making lifecycle transitions auditable.
- **Evidence:** Log assertions live in `tests/ActualApi.test.ts` and the
  behaviour is implemented in `src/utils/ActualApi.ts`.
- **Future Work:** None at this time.

## Epic 2: Importer determinism and guard rails

- **Epic Assessment:** ✅ Done. Stories 2.1–2.3 landed together, so importer
  refactors in Epics 8 and 10 can assume deterministic ordering, guarded start
  balances, and fast-fail account mapping validation.

### Story 2.1 – Normalize MoneyMoney transactions before conversion

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** MoneyMoney transactions are now sorted by `valueDate` and a
  deterministic tie-breaker before any importer filtering or conversion so the
  downstream balance calculations and deduplication logic operate on a stable
  sequence.
- **Evidence:** Implemented in `src/utils/Importer.ts` with regression coverage
  in `tests/Importer.test.ts` to confirm ordering and starting-balance
  behaviour.
- **Future Work:** None at this time.

### Story 2.2 – Extend starting balance coverage for missing booked transactions

- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Context:** Coverage now exercises importer behaviour when MoneyMoney omits
  booked transactions, ensuring unchecked entries still produce a starting
  balance while disabled unchecked imports continue to emit the generic
  missing-transactions hint to extend the date range or review ignore patterns.
- **Evidence:** `tests/Importer.test.ts` asserts the warning text, hint, and
  synthetic `Starting balance` memo/amount for unchecked-transaction scenarios.
- **Key Files:** `src/utils/Importer.ts`, `tests/Importer.test.ts`.

### Story 2.3 – Fail imports when account mapping resolution breaks

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Outcome:** `AccountMap.loadFromConfig` now fails fast when configured
  MoneyMoney or Actual references cannot be resolved during an unconstrained
  import, while filtered runs can still skip unrelated mappings without
  aborting work.
- **Evidence:** Unit coverage in `tests/AccountMap.test.ts` asserts the failure
  messaging and filtered behaviour; CLI integration coverage in
  `tests/commands/import.command.test.ts` verifies the surfaced error message
  and shutdown flow.
- **Key Files:** `src/utils/AccountMap.ts`, `tests/AccountMap.test.ts`,
  `tests/commands/import.command.test.ts`, `README.md`.
- **Future Work:** None; configuration drift now halts imports with actionable
  guidance.

## Epic 3: Payee transformer resilience

- **Epic Assessment:** 🚧 Not started. The payee cache remains a weak
  point—without automatic healing or payload validation the importer risks stale
  payee names. Prioritising Stories 3.1–3.3 would reduce production incidents
  tied to corrupt OpenAI cache data.

### Story 3.1 – Heal corrupt payee cache entries automatically

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** `PayeeTransformer` now detects JSON parse failures when loading
  `openai-model-cache.json`, logs a warning that the cache was reset, and removes
  the corrupt file before refetching the model list so subsequent runs receive a
  fresh cache.
- **Evidence:** The regression coverage in `tests/PayeeTransformer.test.ts`
  stubs a corrupted cache file, asserts the warning, verifies the healed cache
  contents, and confirms a follow-up run uses the regenerated file without
  additional API calls.
- **Future Work:** Consider treating structurally invalid cache payloads (e.g.,
  missing fields) as corrupt to provide the same auto-healing behaviour.

### Story 3.2 – Short-circuit on malformed OpenAI payloads

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** The transformer now detects empty payloads and duplicate keys in
  OpenAI responses, falling back to original payee names with appropriate
  warnings when malformed data is encountered.
- **Evidence:** Implemented in `src/utils/PayeeTransformer.ts` with regression
  coverage in `tests/PayeeTransformer.test.ts` to confirm fallback behavior and
  warning messages for both empty payloads and duplicate key scenarios.
- **Future Work:** None at this time.

### Story 3.3 – Emit structured timing metrics for payee transformation

- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** The importer logs total transformation duration but not
  structured timing hints. There is no schema for downstream consumers to parse.
- **Next Steps:**
  - Extend `Logger` usage to emit a consistent object (e.g., start/end
    timestamps and elapsed ms) when `transformPayees` runs.
  - Add assertions in `tests/PayeeTransformer.test.ts` that log shape remains
    backward compatible.
  - Consider adding a metrics hook to bubble timing to CLI-level logs.
- **Key Files:** `src/utils/PayeeTransformer.ts`, `src/utils/Logger.ts`,
  `tests/PayeeTransformer.test.ts`.

## Epic 4: CLI usability and coverage

**Epic Assessment:** ✅ Done. Stories 4.1–4.3 shipped the harness, option
validation, and failure propagation coverage, so downstream work can rely on
end-to-end CLI tests being available.

### Story 4.1 – Establish CLI integration tests for `import`

- **Complexity:** 8 pts
- **Status:** ✅ Done
- **Outcome:** CLI integration coverage now executes the compiled binary with a
  reusable harness. Tests simulate multiple servers, dry-run imports, and
  invalid account filters by injecting mock Actual/MoneyMoney layers via a
  custom loader.
- **Evidence:** `tests/helpers/cli.ts` builds the CLI once per run,
  `tests/helpers/cli-mock-loader.mjs` records dependency usage, and
  `tests/commands/import.command.test.ts` asserts dry-run messaging,
  multi-budget imports, and error propagation.
- **Follow-up:** Future CLI stories can extend the harness with additional
  assertions (e.g., exit-code propagation, help output snapshots).

#### Task 4.1a – Build CLI test harness

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Notes:** Harness lives in `tests/helpers/cli.ts` and exposes `runCli`,
  `createCliEnv`, and `getCliEntrypoint` helpers that compile the CLI once and
  wire custom Node options.

#### Task 4.1b – Cover positive CLI flows

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Notes:** `tests/commands/import.command.test.ts` validates dry-run
  messaging, server/budget filtering, and successful execution across multiple
  budgets.

#### Task 4.1c – Exercise negative CLI paths

- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Notes:** CLI tests assert the mocked importer throws on unknown accounts and
  that the command exits with a non-zero code while still shutting down Actual
  connections.

### Story 4.2 – Clamp `--logLevel` via a yargs coercion hook

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Outcome:** The CLI now clamps `--logLevel` to the supported 0–3 range via a
  yargs coercion hook and throws with actionable guidance when non-numeric
  values are provided, preventing unsupported verbosity settings from leaking
  into commands.
- **Evidence:** `tests/commands/cli-options.command.test.ts` records the
  constructed logger level for high/low inputs, asserts the validation error
  path, and snapshots `--help` output so global option documentation stays in
  sync.
- **Follow-up:** None at this time.

### Story 4.3 – Propagate CLI exit codes for importer failures

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Outcome:** CLI integration coverage now forces importer failures and
  verifies the process exits with code `1`, confirming the `run().catch`
  boundary surfaces errors to callers instead of silently logging them.
- **Evidence:** `tests/commands/import.command.test.ts` asserts the mocked
  importer failure propagates to `stderr` and a non-zero exit code, while
  `tests/helpers/cli-mock-loader.mjs` records the synthetic crash for debugging.
- **Follow-up:** None at this time.

## Epic 5: Observability and developer experience

- **Epic Assessment:** ✅ Done. Configuration default logging now ships
  alongside consolidated local CI tooling and contributor documentation, so
  engineers have the observability and workflow guardrails envisioned for this
  epic.

### Story 5.1 – Log configuration defaulting decisions

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Context:** `loadConfig` now returns structured defaulting metadata so
  commands can emit debug logs summarising which configuration values fell back
  to defaults.
- **Evidence:** `import.command.ts` logs default usage through
  `logDefaultedConfigDecisions` when DEBUG logging is enabled, and
  `tests/config.test.ts` covers metadata collection and log level gating.
- **Future Work:** Consider surfacing aggregated summaries once additional
  modules start consuming the default metadata.
- **Key Files:** `src/utils/config.ts`, `src/utils/Logger.ts`,
  `tests/config.test.ts`.

### Story 5.2 – Provide a consolidated `npm run smoke`

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** The repository provides individual quality gate scripts that can be
  chained together, and the CI matrix mirrors the same gate coverage. Husky's
  `pre-push` hook and the README's development section direct contributors to
  run the quality gates.
- **Evidence:** See the individual scripts in `package.json`, the development
  workflow guidance in `README.md`, and the quality matrix defined in
  `.github/workflows/ci.yml`.
- **Future Work:** None - the individual scripts provide flexibility while
  maintaining the same coverage as the previous consolidated approach.
- **Key Files:** `package.json`, `.github/workflows/ci.yml`, `README.md`.

### Story 5.3 – Document importer fixture workflow

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Context:** The repository documents importer fixture expectations alongside
  the CLI harness instructions, and the CI workflow continues to execute the
  same suites to validate fixture health on every push and PR.
- **Evidence:** Guidance lives with the test harness documentation
  (`tests/helpers/cli.ts`, `tests/helpers/cli-mock-loader.mjs`), and
  `.github/workflows/ci.yml` enforces the lint/type/build/test matrix that
  exercises the importer fixtures.
- **Future Work:** Expand the contributor docs if additional fixture types
  appear, but the current guidance and automation meet the epic’s requirements.
- **Key Files:** `README.md`, `.github/workflows/ci.yml`, `tests/helpers/`.

## Epic 6: Testing & Reliability

- **Epic Assessment:** ✅ Done. Error-path fixtures, malformed export
  guards, and structured logging schemas now keep the CLI observable and
  resilient under test.

### Story 6.1 – Expand error-path coverage

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Outcome:** Tests now exercise Actual API network disconnects and credential
  failures via shared fixtures, and the importer rejects malformed MoneyMoney
  exports with actionable errors.
- **Evidence:**
  - `tests/helpers/error-fixtures.ts` centralises failure fixtures for reuse in
    `tests/ActualApi.test.ts`.
  - `tests/ActualApi.test.ts` covers friendly messaging when initialisation
    fails due to network or credential issues.
  - `tests/Importer.test.ts` asserts the importer surfaces guidance when
    MoneyMoney exports omit critical transaction fields.
  - Testing guidelines in `tests/AGENTS.md` outline how to extend the fixtures
    when new failure scenarios surface.
- **Next Steps:** Monitor for additional failure shapes (e.g., TLS errors) to
  expand the fixture catalog as they surface.
- **Key Files:** `tests/helpers/`, `tests/Importer.test.ts`, `tests/AGENTS.md`.

#### Task 6.1a – Shared error fixtures

- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Notes:** Added `tests/helpers/error-fixtures.ts` with reusable network and
  credential failure builders referenced by Actual API suites.

#### Task 6.1b – Malformed export tests

- **Complexity:** 2 pts
- **Status:** ✅ Done
- **Notes:** Importer now guards against incomplete MoneyMoney transactions and
  reports actionable errors backed by regression tests.

#### Task 6.1c – Document new failure scenarios

- **Complexity:** 1 pt
- **Status:** ✅ Done
- **Notes:** Documented the shared fixtures and malformed export guidance in
  `tests/AGENTS.md` so future contributors know how to extend coverage.

### Story 6.2 – Standardise debug log schema for observability

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Outcome:** CLI callers can opt into structured JSON logs, ensuring
  observability tools receive a consistent schema while keeping colourful text
  output as the default experience.
- **Evidence:**
  - `src/utils/Logger.ts` accepts a `structuredLogs` flag and serialises
    messages, timestamps, and normalised hints into JSON payloads.
  - CLI global options expose `--structuredLogs`, flowing through
    `src/index.ts`, command handlers, and CLI harness tests.
  - `tests/utils/Logger.test.ts` asserts the JSON envelope while
    `tests/commands/cli-options.command.test.ts` verifies the new CLI switch.
- **Next Steps:** Monitor downstream tooling for additional fields (e.g.,
  request identifiers) that might warrant schema extensions.
- **Key Files:** `src/utils/Logger.ts`, `src/index.ts`,
  `tests/utils/Logger.test.ts`, `tests/commands/cli-options.command.test.ts`.

## Epic 7: CLI UX

- **Epic Goal:** Reduce friction for MoneyMoney users operating the CLI by
  making help content actionable and surfacing clear guidance when imports
  fail.
- **Business Value:** Faster self-serve adoption lowers maintainer support load
  while increasing successful imports from first-run users.
- **Success Criteria:**
  - Help output includes at least one vetted example per command and is covered
    by golden tests.
  - 90% of CLI errors triggered in integration tests display translated,
    user-friendly guidance.
  - CLI telemetry (existing structured logs) exposes a stable
    `cliHelpShown`/`friendlyError` marker to measure adoption.

### Story 7.1 – Contextual help and examples

- **Story:** As a CLI user, I want `--help` output to include contextual
  examples for each command so that I can discover the correct syntax without
  reading the source.
- **Status:** ⬜ Not started
- **Acceptance Criteria:**
  - Every top-level command lists at least one example illustrating common
    options.
  - `npm test -- tests/commands/help.command.test.ts` snapshots the rendered
    help output.
  - README command snippets stay consistent with the updated help text.
- **Depends on:** Harness from Epic 4 (already complete).
- **Sequence:** 7.1 should ship before 7.2 to lock down help formatting.
- **Tasks:**
  - Update `src/index.ts` and command modules with `.example()` metadata.
  - Add or refresh CLI help snapshot tests in `tests/commands/help.command.test.ts`.
  - Sync README usage sections with the new examples.
  - Add telemetry marker implementation: define `cliHelpShown` boolean field in structured logging schema and emit when help/guidance is displayed.
  - Add unit tests asserting `cliHelpShown` marker is emitted with expected schema.
  - Run linting/test suite and request review.

### Story 7.2 – Guardrail validation for common mistakes

- **Story:** As a CLI user, I want the tool to detect missing configuration or
  unsupported option combinations before contacting Actual so that I get
  immediate, actionable feedback.
- **Status:** ⬜ Not started
- **Acceptance Criteria:**
  - CLI validates presence of required config paths and incompatible flags,
    returning exit code 1 with guidance.
  - Integration tests cover at least two validation failures with snapshot
    output.
  - Documentation lists validation guardrails and troubleshooting tips.
- **Depends on:** 7.1 (reuse updated help scaffolding).
- **Sequence:** Implement after 7.1 to reuse improved help text references.
- **Tasks:**
  - Extend command option parsing to perform upfront validation checks.
  - Add integration tests in `tests/commands/import.command.test.ts` for invalid flag and missing
    config scenarios (following the pattern established in Story 4.1).
  - Document validation behaviour in README troubleshooting section.
  - Update changelog/backlog entry and request review.

### Story 7.3 – Friendly translation of backend errors

- **Story:** As a CLI user, I want backend failures (e.g., missing budgets or
  authentication issues) translated into friendly CLI messages so that I know
  how to resolve the problem.
- **Status:** ⬜ Not started
- **Acceptance Criteria:**
  - Common Actual API error codes map to curated CLI messages with remediation
    steps.
  - Integration tests assert message translations stay in sync with
    `ActualApi.getFriendlyErrorMessage`.
  - Structured logs flag translated errors via a `friendlyError` field.
- **Depends on:** 7.2 (shares validation utilities) and Epics 1 & 2 error
  handling foundations.
- **Sequence:** Ship after 7.2 to avoid duplicating validation copy updates.
- **Tasks:**
  - Implement an error translation helper consumed by CLI commands.
  - Backfill integration tests for each translated error scenario.
  - Add documentation on common errors and recovery paths.
  - Add telemetry marker implementation: define `friendlyError` boolean field in structured logging schema and emit when translated user-friendly error is presented (include context like command, errorCode, and minimal user-safe details).
  - Add unit tests asserting `friendlyError` marker is emitted with expected schema and update telemetry ingestion/test fixtures.
  - Update metrics/telemetry dashboards and changelog to reflect the new markers.
  - Ensure structured logging includes telemetry flag and request review.

### Risks & Mitigations

- Changes to help output risk brittle snapshots → mitigate with dedicated
  fixtures and mdformat enforcement.
- Validation rejections could block legitimate advanced workflows → add feature
  flags or environment overrides for power users during rollout.
- Error translation drift may regress UX → schedule quarterly audits against
  Actual API docs (or when Actual SDK major versions bump) and maintain unit tests guarding the mapping table.
  **Acceptance criteria:** 90% test coverage of error mapping table,
  audit checklist with 5+ validation points, automated quarterly reminders.

## Epic 8: Code quality and maintainability

- **Epic Assessment:** 🚧 Not started. Analysis reveals several high-complexity hotspots that need refactoring:
  - `Importer.importTransactions` (298 lines) mixes multiple concerns in a monolithic method
  - `ActualApi.runActualRequest` (94 lines) handles timeout orchestration, console patching, and error handling
  - `import.command.ts` (91 lines) tightly couples CLI parsing, validation, and orchestration
  - Error handling is fragmented across modules with inconsistent patterns
  - Budget resolution logic is well-implemented but not reusable
  Executing these refactors will significantly improve maintainability and reduce risk before adding roadmap features.

### Story 8.1 – Refactor retry/resolution logic into reusable helpers

- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Budget directory resolution logic is implemented in `ActualApi.resolveBudgetDataDir()` with defensive error handling and structured debug logs. The resolver scans `metadata.json` files and provides clear error messages when no `syncId` match is found. However, this logic is tightly coupled within `ActualApi` and not easily reusable across other commands.
- **Assessment:** The resolution logic is well-implemented with good error handling, but it's not modularized for reuse. The current implementation includes proper logging, error surfacing, and defensive programming, but lacks the abstraction needed for broader reuse.
- **Next Steps:**
  - Extract `resolveBudgetDataDir` logic into a standalone utility in `src/utils/`
  - Create a reusable `BudgetResolver` class with dependency injection for logger
  - Update `ActualApi` to use the new resolver while maintaining current behavior
  - Add unit tests for the resolver independent of `ActualApi`
- **Key Files:** `src/utils/ActualApi.ts` (lines 128-200), `tests/ActualApi.test.ts`, future `src/utils/BudgetResolver.ts`

#### Task 8.1a – Draft helper API

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Design `BudgetResolver` interface with clear inputs/outputs and error handling patterns.

#### Task 8.1b – Adopt helper across callers

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Refactor `ActualApi` to use `BudgetResolver` and ensure CLI commands can use it directly.

#### Task 8.1c – Document helper usage

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Document the resolver API and usage patterns for future commands.

### Story 8.2 – Consolidate API error handling into a single class

- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** Error handling is implemented across multiple modules with different patterns:
  - `ActualApi` has `getFriendlyErrorMessage()` for HTTP status mapping and `createErrorWithCause()` for error wrapping
  - `PayeeTransformer` has specific OpenAI API error handling with status code mapping (401, 403, 429, 500, 502, 503, 504)
  - `config.ts` has Zod validation error formatting with path-based error messages
  - `validate.command.ts` has TOML parsing and Zod error handling
- **Assessment:** Error handling is functional but fragmented. Each module implements its own error formatting and user-friendly messaging. There's no unified error hierarchy, making it difficult to maintain consistent error experiences across the application.
- **Next Steps:**
  - Design a unified `ApiError` class that encapsulates HTTP status, error metadata, and user-facing messages
  - Create error factories for common scenarios (network errors, validation errors, API errors)
  - Migrate existing error handling to use the unified class while preserving current user experience
  - Add structured error logging with consistent metadata
- **Key Files:** `src/utils/ActualApi.ts` (lines 222-263), `src/utils/PayeeTransformer.ts` (lines 432-467), `src/utils/config.ts` (lines 242-266), `tests/ActualApi.test.ts`

#### Task 8.2a – Define consolidated error shape

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Create `ApiError` base class with HTTP status, error codes, user messages, and debug metadata.

#### Task 8.2b – Update consumers to use the new error class

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Refactor `ActualApi`, `PayeeTransformer`, and config modules to use unified error handling.

#### Task 8.2c – Document the new error hierarchy

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Document error handling patterns and provide examples for future contributors.

### Story 8.3 – Decompose `Importer.importTransactions` into staged pipelines

- **Complexity:** 13 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `Importer.importTransactions` is a monolithic 298-line method that orchestrates the entire import process:
  - Date resolution and earliest import date handling
  - MoneyMoney API fetching with timing metrics
  - Transaction sorting by `valueDate` with deterministic tie-breaker
  - Unchecked transaction filtering and ignore pattern matching
  - Account grouping and transaction conversion
  - Starting balance calculation and deduplication
  - Payee transformation with AI integration
  - Dry-run vs live mode handling
- **Assessment:** The method is well-tested (14 comprehensive test cases) but has high complexity due to mixing concerns. The current implementation handles edge cases well but is difficult to extend for new features like category translation or off-budget sync. The method has good logging and error handling but lacks modularity.
- **Next Steps:**
  - Design a pipeline architecture with discrete stages: Fetch → Filter → Group → Transform → Reconcile → Persist
  - Extract each stage into focused modules with clear interfaces and unit tests
  - Create a `TransactionImportPipeline` orchestrator that composes stages
  - Maintain existing behavior while enabling easier testing and extension
- **Key Files:** `src/utils/Importer.ts` (lines 25-298), `tests/Importer.test.ts` (14 test cases), future pipeline modules

#### Task 8.3a – Define importer stage interfaces

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Design TypeScript interfaces for each pipeline stage with clear input/output contracts.

#### Task 8.3b – Extract filtering and transformation helpers

- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Notes:** Create `TransactionFetcher`, `TransactionFilter`, `TransactionConverter`, and `TransactionReconciler` modules.

#### Task 8.3c – Introduce orchestration tests for dry-run vs. live modes

- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Notes:** Add integration tests ensuring both modes produce identical transaction batches while only live mode persists data.

### Story 8.4 – Simplify `ActualApi.runActualRequest` timeout handling

- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `runActualRequest` is a complex 94-line method that handles multiple concerns:
  - Timeout orchestration with configurable timeouts and fallback values
  - Console patching to suppress Actual SDK noise with depth tracking
  - Shutdown recovery with recursive timeout handling
  - Error translation and friendly messaging
  - State management for initialization flags and data directory tracking
- **Assessment:** The method is functional but has high complexity due to mixing timeout logic, console management, and error handling. The current implementation includes good error recovery and console noise suppression, but the nested promises and manual state management make it difficult to test and maintain.
- **Next Steps:**
  - Extract `ConsolePatcher` utility for noise suppression with clear lifecycle management
  - Create `TimeoutManager` for timeout orchestration and shutdown recovery
  - Simplify `runActualRequest` to compose these utilities with clear error boundaries
  - Add comprehensive tests for timeout scenarios and state management
- **Key Files:** `src/utils/ActualApi.ts` (lines 265-358), `tests/ActualApi.test.ts`, future utility modules

#### Task 8.4a – Extract console patching & logging utilities

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Create `ConsolePatcher` class with `patch()` and `unpatch()` methods and depth tracking.

#### Task 8.4b – Add timeout and shutdown resilience tests

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Add tests for timeout scenarios, shutdown recovery, and state consistency using fake timers.

#### Task 8.4c – Refactor run wrapper to compose helpers

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Simplify `runActualRequest` to use the new utilities while maintaining current behavior.

### Story 8.5 – Modularise CLI import orchestration

- **Complexity:** 8 pts
- **Status:** ⬜ Not started
- **Current Behaviour:** `handleCommand` in `import.command.ts` is a 91-line function that orchestrates the entire CLI import process:
  - Configuration loading with default decision logging
  - PayeeTransformer initialization based on config
  - MoneyMoney database access validation
  - Server and budget filtering with validation
  - Nested server/budget processing loops
  - Date parsing and validation
  - Error handling and logging coordination
- **Assessment:** The CLI orchestration is functional but tightly coupled. The current implementation has good error handling and validation, but the mixed concerns (parsing, validation, orchestration) make it difficult to test individual components and extend with new features like telemetry or multi-budget sync.
- **Next Steps:**
  - Extract `CliFilterParser` for server/budget/account/date parsing with validation
  - Create `ImportOrchestrator` for server/budget iteration and lifecycle management
  - Simplify `handleCommand` to focus on CLI concerns while delegating to orchestrator
  - Add unit tests for parsing helpers and integration tests for orchestration
- **Key Files:** `src/commands/import.command.ts` (lines 157-225), `tests/commands/import.command.test.ts` (5 CLI tests), future orchestration modules

#### Task 8.5a – Extract filter parsing & validation helpers

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Create `CliFilterParser` with methods for date parsing, server filtering, and budget validation.

#### Task 8.5b – Introduce lifecycle orchestration wrapper

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Notes:** Create `ImportOrchestrator` that handles server/budget iteration, dependency injection, and lifecycle logging.

#### Task 8.5c – Cover CLI flows with new helpers

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Notes:** Add unit tests for parsing helpers and integration tests for orchestration scenarios.

## Epic 9: Integration and tooling

- **Epic Assessment:** ✅ Done. CI now enforces linting, complexity, and
  formatting across application, test, and config code while onboarding docs
  capture the expanded coverage, fulfilling the epic’s integration and tooling
  goals.

### Story 9.1 – Expand CI coverage with linting, type-checking, and matrix builds

- **Complexity:** 13 pts
- **Status:** ✅ Done
- **Context:** `.github/workflows/ci.yml` defines a matrix over Node 20 and 22
  running lint (ESLint + Prettier), type-check, build, and test jobs. Commitlint
  runs separately for commit hygiene.
- **Evidence:** Workflow steps invoke `npm run lint:eslint`,
  `npm run lint:prettier`, `npm run typecheck`, `npm run build`, and `npm test`
  with npm caching enabled.
- **Future Work:** None—monitor execution times and adjust the matrix if
  additional Node LTS versions are required.

#### Task 9.1a – Add ESLint and Prettier steps to CI

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Notes:** Implemented in the `quality` job with conditional steps per
  `matrix.task`.

#### Task 9.1b – Add a dedicated `tsc --noEmit` job

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Notes:** The matrix includes a `typecheck` task invoking
  `npm run typecheck`.

#### Task 9.1c – Configure GitHub Actions matrix builds for Node LTS

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Notes:** Node versions 20 and 22 run across all tasks with npm caching.

### Story 9.2 – Improve developer onboarding

- **Complexity:** 3 pts
- **Status:** ✅ Done
- **Outcome:** Added a comprehensive `CONTRIBUTING.md`, refreshed the README
  with a developer onboarding section, and aligned the `.coderabbit` knowledge
  base with the new guidance.
- **Key Files:** `README.md`, `CONTRIBUTING.md`, `.coderabbit.yaml`.

### Story 9.3 – Enforce cyclomatic complexity budgets via ESLint

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Outcome:** Added `eslint-plugin-sonarjs`-backed rules that cap function
  cyclomatic complexity at 40 and cognitive complexity at 60. The guard rails
  are available through `npm run lint:complexity`, which CI and the local smoke
  test invoke alongside the existing lint workflow.
- **Evidence:** `eslint.config.mjs` gates the plugin via
  `ENABLE_COMPLEXITY_RULES`, `package.json` exposes the dedicated script,
  `.github/workflows/ci.yml` runs it in the lint matrix, and contributing docs
  explain how to respond to violations.
- **Follow-up:** Monitor importer-heavy functions; if budgets prove too strict,
  adjust thresholds with design discussion rather than disabling the rule ad
  hoc.

### Story 9.4 – Align lint and formatter coverage with active code paths

- **Complexity:** 5 pts
- **Status:** ✅ Done
- **Outcome:** `eslint.config.mjs` now lints the source, test, and TypeScript
  configuration files with Vitest globals for tests, while the npm scripts call
  ESLint against the repository root. Prettier runs over the same surface area
  except for Markdown, which is formatted by `mdformat` to stay compatible with
  CodeRabbit’s suggestions; the shared `.prettierignore` skips generated
  artifacts and `.md` files, and contributor docs spell out the split tooling
  and how to extend it.
- **Evidence:** Updated ESLint flat config, root-level lint/format scripts in
  `package.json`, the refined `.prettierignore`, and refreshed guidance in
  `CONTRIBUTING.md` all landed together with the CI matrix continuing to
  exercise the expanded commands.
- **Future Work:** None—add directories to the lint/format scope by updating
  `eslint.config.mjs` and `.prettierignore` when new code paths are introduced.

## Epic 10: Multi-budget support with observability

- **Epic Assessment:** Ambitious but plausible once Epic 8 refactors land.
  Actual’s Node bindings support switching sync IDs, yet we must prove cache
  invalidation, credential reuse, and logging expectations so we do not regress
  the session lifecycle work in Epic 1.

### Story 10.1 – Model configuration and persistence

- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Outcome:** Draft ADR/design doc covering configuration schema updates and
  storage of per-budget metadata, including edge-case handling for credential
  reuse and partial failures.
- **Next Steps:** Capture configuration proposals, review them with operators,
  and document open questions around state persistence between runs.
- **Key Files:** docs, design docs.

### Story 10.2 – Implement runtime support and tests

- **Complexity:** 5 pts
- **Status:** ⬜ Not started
- **Outcome:** Update importer/CLI flows with regression tests ensuring session
  resets between budgets while preserving logging clarity and failure
  propagation.
- **Next Steps:** Extend `ActualApi` helpers, add CLI integration tests, and
  verify sequential budget imports remain deterministic.
- **Key Files:** `src/commands/import.command.ts`, `src/utils/ActualApi.ts`,
  `tests/commands/import.command.test.ts`.

### Story 10.3 – Add telemetry and documentation

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Outcome:** Enhance logging/metrics and write user-facing docs explaining how
  budget switching works, including troubleshooting guidance for partial
  failures.
- **Next Steps:** Define structured log schemas, add CLI surfacing, and expand
  README/backlog sections covering multi-budget workflows.
- **Key Files:** `src/utils/Logger.ts`, docs.

## Epic 11: Configurable data directory override

- **Epic Assessment:** Clear operator ask with manageable scope. We must audit
  touchpoints that assume the default path and document how overrides interact
  with existing auto-discovery so diagnostics remain accurate.

### Story 11.1 – Extend configuration and CLI parsing

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Outcome:** Update the Zod schema, CLI options, and default resolution logic
  to accept a data-directory override with validation and descriptive errors.
- **Next Steps:** Align configuration parsing with CLI flags/environment
  variables and capture migration notes.
- **Key Files:** `src/index.ts`, `src/utils/shared.ts`, `src/utils/config.ts`.

### Story 11.2 – Update tests and documentation

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Outcome:** Add coverage in config and CLI tests plus README/backlog updates
  showing how the override behaves alongside auto-discovery.
- **Next Steps:** Exercise positive/negative override scenarios in tests and
  document expected directory resolution order.
- **Key Files:** `tests/config.test.ts`, `tests/commands/import.command.test.ts`,
  docs.

### Story 11.3 – Maintain backward compatibility guidance

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Outcome:** Document migration steps and ensure defaults remain unchanged
  unless overrides are provided so operators can adopt the feature safely.
- **Next Steps:** Draft release notes/backlog guidance and review messaging with
  stakeholders.
- **Key Files:** docs.

## Epic 12: Off-budget balance synchronisation

- **Epic Assessment:** Valuable for parity with MoneyMoney but requires careful
  design. MoneyMoney’s API only exposes point-in-time balances, so we must
  guarantee idempotent reconciliation entries and avoid noisy updates.

### Story 12.1 – Model configuration for off-budget balance sync

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Outcome:** Allow accounts to opt into reconciliation, including category
  mapping and memo defaults with validation for unsupported account types.
- **Next Steps:** Extend configuration schema, capture operator expectations,
  and document guard rails.
- **Key Files:** `src/utils/config.ts`, docs.

### Story 12.2 – Implement reconciliation transaction generation

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Outcome:** Extend importer logic to compute deltas, emit reconciliation
  transactions, and ensure idempotency across runs.
- **Next Steps:** Add importer helpers, update CLI flows, and create regression
  coverage for positive/negative delta cases.
- **Key Files:** `src/utils/Importer.ts`, `src/commands/import.command.ts`,
  `tests/Importer.test.ts`.

### Story 12.3 – Document and test off-budget reconciliation

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Outcome:** Cover positive/negative delta cases in unit tests and update
  README/backlog guidance describing how synthetic entries appear in Actual.
- **Next Steps:** Expand docs with troubleshooting tips and ensure examples show
  reconciliation categories.
- **Key Files:** `tests/Importer.test.ts`, docs.

## Epic 13: MoneyMoney category translation

- **Epic Assessment:** Reasonable stretch goal once configuration ergonomics
  improve. Requires confirmation that we can reliably address Actual categories
  by stable IDs and that MoneyMoney exports carry sufficient identifiers.

### Story 13.1 – Define category translation configuration

- **Complexity:** 3 pts
- **Status:** ⬜ Not started
- **Outcome:** Extend the config schema with optional mapping blocks and surface
  validation errors when categories are missing or ambiguous.
- **Next Steps:** Prototype mapping ergonomics, gather operator feedback, and
  document fallback behaviour.
- **Key Files:** `src/utils/config.ts`, docs.

### Story 13.2 – Apply translations with importer coverage

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Outcome:** Update importer logic/tests to apply mappings, ensuring unlisted
  categories fall back gracefully with warnings and structured logs.
- **Next Steps:** Implement translation helpers, add regression tests, and keep
  CLI output clear about fallback scenarios.
- **Key Files:** `src/utils/Importer.ts`, `tests/Importer.test.ts`.

### Story 13.3 – Document category translation workflows

- **Complexity:** 2 pts
- **Status:** ⬜ Not started
- **Outcome:** Provide configuration and CLI documentation showing how to
  enable, seed, and test the mapping while highlighting audit considerations.
- **Next Steps:** Update README/backlog sections with examples and ensure
  release notes call out migration expectations.
- **Key Files:** docs.
