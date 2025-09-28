# Source Code Guidelines for `actual-moneymoney`

## CLI structure (`src/index.ts`)

- `src/index.ts` initialises the CLI, ensures the application data directory exists, and registers command modules.
- Global options:
    - `--config` allows an alternative TOML configuration path.
    - `--logLevel` controls the `Logger` verbosity (0-3).
- The parser uses `.fail()` to surface yargs validation errors as real `Error` instances. Preserve this behaviour when adding new options.

## Command modules (`src/commands/`)

### General expectations

- Export a default `CommandModule<ArgumentsCamelCase>`.
- Keep handlers async and delegate to a `handle*` helper to keep the exported module lightweight.
- Always resolve configuration via `getConfig(argv)` so shared CLI flags stay consistent across commands.
- Instantiate `Logger` with the requested log level and reuse it for all logging.

### `import.command.ts`

- Supports filters for server (`--server`), budget (`--budget`), account (`--account`), and date ranges (`--from`, `--to`). Options should accept either a single value or an array; coerce values into arrays before processing.
- Parse dates with `date-fns/parse` using `DATE_FORMAT` from `src/utils/shared.ts`. Reject invalid dates with actionable error messages.
- Require at least one Actual server in the configuration and surface missing server/budget filters with explicit errors.
- Before importing, call `checkDatabaseUnlocked()` from `moneymoney` and fail fast if the database is locked.
- For each selected server/budget combination:
    - Create an `ActualApi` instance, call `init()`, then `loadBudget()` before performing any work, and always `shutdown()` inside a `finally` block.
    - Build an `AccountMap` and load it up front via `loadFromConfig()`.
    - Instantiate `Importer` with the resolved config, budget, API, logger, account map, and optional `PayeeTransformer` (only when `config.payeeTransformation.enabled` is true).
    - Pass `isDryRun` through to `Importer.importTransactions()`; the importer is responsible for enforcing the dry-run logic.

### `validate.command.ts`

- Uses `getConfigFile(argv)` to resolve the path and logs which file was inspected.
- If the file does not exist, create it using `EXAMPLE_CONFIG` from `src/utils/shared.ts` and exit early after logging guidance.
- Parse the TOML file, validate against `configSchema`, and print Zod issues with `path`, `code`, and `message` details. Forward syntax errors with line/column information.

## Utilities (`src/utils/`)

### `config.ts`

- Central Zod schema (`configSchema`) describes the entire configuration. Add new options with exhaustive validation and update the corresponding inferred types (`Config`, `ActualServerConfig`, etc.).
- `budgetSchema` enforces end-to-end encryption requirements (password required when enabled) and earliest import date format. Keep the schema and error messages aligned with tests in `tests/config.test.ts`.
- `getConfig(argv)` handles missing files, TOML parsing, and schema validation. Preserve detailed error messaging when adjusting behaviour.
- Maintain constants such as `DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS` (5 minutes) and `FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS` (45 seconds) alongside the schema so command code can reuse them.

### `shared.ts`

- Exposes reusable constants:
    - `DATE_FORMAT` (`yyyy-MM-dd`) used by commands and importer.
    - `APPLICATION_DIRECTORY`, `DEFAULT_DATA_DIR`, and `DEFAULT_CONFIG_FILE` for filesystem paths.
    - `EXAMPLE_CONFIG` string used by the `validate` command. Update it whenever the configuration schema evolves.

### `Logger.ts`

- Provides a coloured console logger with four levels (`ERROR`, `WARN`, `INFO`, `DEBUG`).
- All code should log via this utility instead of `console.log` directly so hint formatting and log levels remain consistent.
- Use the `hint` argument (string or string array) to provide contextual details such as server URLs, budget IDs, or suggestion text.

### `ActualApi.ts`

- Wraps `@actual-app/api` and provides higher-level helpers (`init`, `loadBudget`, `getAccounts`, `getTransactions`, `importTransactions`, `shutdown`).
- All SDK calls must go through `runActualRequest()` to benefit from timeout protection, noise suppression, and consistent error logging. Passing `additionalHints` helps the logger provide context when errors occur.
- Console output from Actual is noisy; `patchConsole()` filters known prefixes. Restore the console in `finally` blocks when modifying the behaviour.
- `ActualApiTimeoutError` is thrown when requests exceed the configured timeout; propagate this class so callers can differentiate timeout failures.

### `AccountMap.ts`

- Fetches MoneyMoney accounts via `getAccounts()` and Actual accounts via `ActualApi.getAccounts()` before building the mapping described in the configuration.
- Supports flexible account references (UUID, account number, or name for MoneyMoney; ID or name for Actual). Preserve these matching rules when extending the mapper.
- `loadFromConfig()` must be called before `getMap()`. When adjusting the public API, maintain this contract to avoid runtime errors in the importer.

### `Importer.ts`

- Orchestrates fetching MoneyMoney transactions, filtering them, and pushing new entries into Actual.
- Respect budget-level settings:
    - `earliestImportDate` acts as a floor for import range.
    - `config.import.importUncheckedTransactions` and `synchronizeClearedStatus` govern which transactions are processed and how clear flags are handled.
    - `config.import.ignorePatterns` contains optional regex lists for comments, payees, and purposes; cache compiled regexes in `patternCache`.
- Build Actual transactions with the correct identifiers so duplicates can be detected (`imported_id` is derived from MoneyMoney data). A synthetic starting balance transaction is created when the Actual account has no history; preserve this behaviour.
- Honour dry-run mode by skipping `ActualApi.importTransactions()` and logging that no changes were made.

### `PayeeTransformer.ts`

- Integrates with the OpenAI API to normalise payee names.
- Validate configuration in the constructor (require `openAiApiKey` when enabled) and configure the client with the model options from the schema.
- Cache model lookups on disk (`openai-model-cache.json` inside `DEFAULT_DATA_DIR`) and keep the in-memory `transformationCache` for repeated payees.
- Respect the masking configuration when logging payee names. Never log raw names when `maskPayeeNamesInLogs` is true.

### `types/`

- Contains custom type declarations/augmentations for the Actual SDK. Update these definitions alongside any SDK upgrades so TypeScript stays accurate.

## Coding standards

- TypeScript files use 4-space indentation, single quotes, semicolons, and Prettier-enforced wrapping (default print width 80). Run the format and lint scripts before committing.
- This project is ESM-first. When importing internal modules, include the `.js` extension (`import Logger from './Logger.js';`).
- Group imports by origin: external dependencies first, then Node built-ins, then internal modules.
- Keep functions and classes strongly typed; avoid implicit `any` by leveraging existing types from utilities and the configuration schema.

## Testing expectations

- Add or update Vitest coverage in `tests/` whenever changing behaviour, prioritising the most important execution paths. There is no requirement to chase 100% coverage—lean suites that guard critical flows are preferred over exhaustive maintenance burdens.
- Use `vi.mock()` to isolate external services (`@actual-app/api`, `moneymoney`, `openai`) and prefer per-test resets via `beforeEach`/`afterEach`.
