# Testing Guide

## Error-path fixtures

- `tests/helpers/error-fixtures.ts` exposes helpers for simulating Actual API
  failures:
  - `makeNetworkDisconnectError` models network disconnects/`ECONNREFUSED`
    scenarios and chains the cause metadata that `runActualRequest` inspects.
  - `makeInvalidCredentialsError` produces authentication failures, allowing
    suites to assert the friendly messaging emitted by the CLI.
- The fixtures are consumed by `tests/ActualApi.test.ts` to verify
  `ActualApi.init()` guidance when connectivity or password issues occur.
- Extend the module with additional helpers (e.g., TLS errors) as new failure
  shapes surface.

## Importer malformed export coverage

- `Importer` now validates MoneyMoney transactions before conversion and raises
  actionable errors when required fields (`valueDate`, `amount`, `id`,
  `accountUuid`) are missing.
- `tests/Importer.test.ts` contains `rejects malformed MoneyMoney transactions`
  to ensure corrupted exports surface a helpful error and avoid partial imports.
- When adding new importer guards, co-locate regression coverage in this file so
  CLI feedback stays actionable.
