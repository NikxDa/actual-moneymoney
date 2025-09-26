# Testing Guidelines for `actual-moneymoney`

## Test runner

- Vitest powers the automated tests. Run the full suite with `npm test` (configured as `vitest run`).
- Tests live under `tests/` and mirror the structure of `src/`:
  - `ActualApi.test.ts` covers timeout handling, console suppression, and the lifecycle of the Actual API wrapper.
  - `Importer.test.ts` verifies MoneyMoney transaction filtering, deduplication, and dry-run behaviour.
  - `PayeeTransformer.test.ts` exercises OpenAI integration, caching, and logging safeguards.
  - `config.test.ts` validates the Zod schema, earliest import date parsing, and encryption requirements.

## Writing and maintaining tests

- Use `vi.mock()` to isolate external dependencies (`@actual-app/api`, `moneymoney`, `openai`). Declare mocks at the top of the file and reset them in `beforeEach` to avoid cross-test bleed.
- Prefer helper factories within the test file for building complex fixtures (see `Importer.test.ts` for examples). Keep fixture data minimal but representative of real MoneyMoney transactions or Actual accounts.
- For async code, mark tests as `async` and `await` promises. Use `vi.useFakeTimers()` sparingly to control timeout scenarios (e.g., Actual API timeouts) and always restore timers in `afterEach`.
- When asserting logging behaviour, rely on `vi.spyOn(logger, 'method')` or mock loggers that mimic the interface in `src/utils/Logger.ts`.
- Keep expectations specific: check argument values, invocation order, and error messages so regressions are caught early.

## Updating tests alongside source changes

- Whenever you touch logic in `src/utils/` or `src/commands/`, review the related test file(s) and extend them to cover the new behaviour.
- Configuration schema updates must extend `config.test.ts` to cover success, failure, and edge cases (e.g., missing passwords when encryption is enabled).
- If new utilities are introduced, add matching test files under `tests/` and follow the naming convention `*.test.ts`.

## Tooling expectations

- Keep the Vitest configuration (`vitest.config.ts`) untouched unless you have a compelling reason to change the runtime.
- Tests should pass with the repo’s linting and formatting rules. Prettier and ESLint ignore the `tests/` directory today, but follow the existing style (4 spaces, single quotes) for consistency.
