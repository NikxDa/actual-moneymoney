# Deep Review – actual-moneymoney (develop)

## 1. Executive Summary

The importer has solid foundations, and the Actual adapter now completes the download → load → sync lifecycle while restoring console state after each request so Vitest no longer hangs.【F:src/utils/ActualApi.ts†L85-L219】【F:tests/ActualApi.test.ts†L53-L195】【chunk:25b872†L1-L8】 Remaining gaps include the `validate` command failing to create parent directories, thin network/error handling against the Actual server and OpenAI, and documentation promises (e.g., automatic config generation) that the code still only partially delivers.【F:src/commands/validate.command.ts†L22-L73】【F:src/utils/ActualApi.ts†L174-L217】【F:src/utils/PayeeTransformer.ts†L92-L188】 Priority shifts to hardening configuration DX and upstream API resilience, then aligning CI with the end-to-end workflow.

### 5-Point Action Plan

1. ✅ Fix the budget lifecycle (download → load → sync) and add error/timeout handling in the Actual adapter (completed in this PR's Actual adapter changes).
1. Harden the CLI configuration path (recursive directory creation, actionable error messages).
1. ✅ Identify the root cause for the Vitest hang and ship a hotfix (console patch + tests); follow-up to gate CI on these runs.
1. Strengthen OpenAI/secret handling (timeouts, response validation, log redaction, cache TTL documentation).
1. Align the toolchain (npm vs. bun), add a typecheck script, and secure the release flow with tests/audit gates.

## 2. Bug List

| ID | Status | Category | File:Line | Short Description | Repro Steps | Expected vs. Current Behaviour | Fix Proposal |
| --- | ----------- | -------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 | ✅ Resolved | Bug | `src/utils/ActualApi.ts:176-219` | Budget lifecycle previously stopped at `downloadBudget`, leaving the session without an active budget.【F:src/utils/ActualApi.ts†L176-L219】 | Covered by the `ActualApi` unit suite (loadBudget test).【F:tests/ActualApi.test.ts†L103-L141】 | Budget download, load, and sync now complete before returning, so account/transaction calls see fresh data.【F:src/utils/ActualApi.ts†L176-L219】 | Fix landed: `loadBudget` chains download → load → sync and logs failures, with regression coverage in Vitest.【F:src/utils/ActualApi.ts†L176-L219】【F:tests/ActualApi.test.ts†L103-L141】 |
| B2 | 🚧 Open | Bug | `src/commands/validate.command.ts:22-29` | `validate` writes config files but does not create parent directories.【F:src/commands/validate.command.ts†L22-L29】 | 1. Run `actual-monmon validate --config ./tmp/custom/config.toml` in an empty project. 2. Command fails with `ENOENT`. | Expected: path is created recursively and example config written (README promise). Actual: write attempt aborts. | Call `fs.mkdir(path.dirname(configPath), { recursive: true })` before `writeFile` and log errors clearly.【F:README.md†L40-L44】 |
| B3 | ✅ Resolved | Bug | `tests/ActualApi.test.ts` | Vitest run used to hang because console patching never unwound after timeouts.【F:tests/ActualApi.test.ts†L143-L195】 | Regression covered by `npm test` and targeted Actual API specs.【chunk:6f7772†L1-L6】【F:tests/ActualApi.test.ts†L53-L195】 | Test suite now exits cleanly; console patching restores globals and clears fake timers.【F:src/utils/ActualApi.ts†L85-L121】【F:tests/ActualApi.test.ts†L53-L195】 | Fixed by wrapping each Actual API request in a scoped `patchConsole` guard and adding timer cleanup in the timeout test.【F:src/utils/ActualApi.ts†L85-L121】【F:tests/ActualApi.test.ts†L143-L195】 |

## 3. Design / Architecture Findings

- **Actual API robustness**: `getUserToken` never checks `response.ok`, so network failures throw vague JSON errors.【F:src/utils/ActualApi.ts†L174-L217】 Add timeouts, status checks, and redact sensitive payloads in logs.
- ✅ **Scoped console patching**: `ActualApi` now wraps each request in a reference-counted `patchConsole`, restoring original loggers after the timeout race and keeping Vitest runs deterministic.【F:src/utils/ActualApi.ts†L85-L121】【F:src/utils/ActualApi.ts†L277-L325】 Continue to monitor concurrent calls, but the open-handle hang is resolved.
- **OpenAI coupling**: `PayeeTransformer` stores the model cache in plain text and logs payees at debug level (privacy leak).【F:src/utils/PayeeTransformer.ts†L92-L188】 Add masking/redaction even for debug logs.
- **Starting balance heuristic**: For empty MoneyMoney slices the importer still creates a starting transaction from the current balance, causing jumps on partial imports.【F:src/utils/Importer.ts†L175-L199】 Add a guard or user-facing warning.

## 4. Refactor Backlog

### Epic A – Harden Actual adapter

_Target state:_ Stable import across multiple budgets/servers and transient server failures.
_Acceptance criteria:_ Budget loads post-download, sync/retry on 5xx/timeout, console patching removed.
_Risks:_ Changes to global logging, tests/mocks need updates.

- ✅ Story A1 (M): integrate `loadBudget` + `sync`, secure shutdown in `finally` (now implemented and covered by tests).【F:src/utils/ActualApi.ts†L176-L275】【F:tests/ActualApi.test.ts†L103-L195】
- ✅ Story A2 (M): refactor console suppression into a scoped helper with regression tests guarding against open handles.【F:src/utils/ActualApi.ts†L85-L121】【F:tests/ActualApi.test.ts†L53-L195】
- Story A3 (S): wrap HTTP fetches with `AbortController`, status checks, and sensitive log redaction.【F:src/utils/ActualApi.ts†L174-L217】

### Epic B – CLI & Config DX

_Target state:_ Users can create/validate configs anywhere.
_Acceptance criteria:_ `validate` creates paths, error text offers guidance, README stays in sync.
_Risks:_ Path handling on Windows/macOS.

- Story B1 (S): recursive `mkdir` before `writeFile`, add tests for success/error paths.【F:src/commands/validate.command.ts†L22-L29】
- Story B2 (S): document CLI option normalisation (`--server`, `--budget`) and add tests for filter logic.【F:src/commands/import.command.ts†L84-L200】

### Epic C – Test/CI hardening

_Target state:_ Deterministic tests locally and in CI (Node 20/22).
_Acceptance criteria:_ `npm test` exits, coverage ≥80 % for importer pipeline.
_Risks:_ MoneyMoney/Actual mocks more complex.

- ✅ Story C1 (M): analysed console patch handles and added Vitest cleanup so the suite exits cleanly.【F:src/utils/ActualApi.ts†L85-L121】【F:tests/ActualApi.test.ts†L143-L195】【chunk:25b872†L1-L8】
- Story C2 (M): add integration tests for importer pipeline (mock MoneyMoney + Actual) covering dedupe/start balance.【F:src/utils/Importer.ts†L27-L210】
- Story C3 (S): extend GitHub Actions with test/typecheck/audit, consolidate bun→npm usage.【F:.github/workflows/ci.yml†L1-L23】【F:package.json†L6-L13】

### Quick Wins (\<1 day)

- ✅ Add missing `npm run typecheck` script and update README (completed).【F:package.json†L6-L13】
- Allow masking toggle for `PayeeTransformer` debug logs.【F:src/utils/PayeeTransformer.ts†L110-L188】
- ✅ Removed `getUserFiles`, reducing dormant Actual adapter code paths.【F:src/utils/ActualApi.ts†L174-L217】

## 5. Test Strategy & Coverage

- **Importer E2E**: Scenarios for dedupe (`imported_id`), starting balance, `ignorePatterns`, dry-run against mocked Actual.【F:src/utils/Importer.ts†L175-L209】
- **Config validation**: Tests for custom paths, schema failures, skip-model-validation flag, and TOML syntax errors.【F:src/utils/config.ts†L8-L104】【F:src/commands/validate.command.ts†L22-L73】
- **ActualApi**: Unit tests for budget lifecycle (init/download/load/shutdown), error handling (401/500), console patch behaviour.
- **CLI smoke**: `--help`, `import --dry-run`, `validate` (new/broken config). Use snapshots with masked payees (respect `maskPayeeNamesInLogs`).【F:src/utils/Importer.ts†L200-L236】
- **Determinism**: Mock timers/date access (`Date.now`, `subMonths`) for reproducible logs.
- **How to invoke all tests**: run `npm test` (alias for Vitest) or `npx vitest run` for CI mode; ensure `npm run lint:eslint`, `npm run lint:prettier`, and `npm run build` pass before publishing.

## 6. Toolchain / CI Recommendations

- Close script gap: add `npm run typecheck` → `tsc --noEmit`; optionally create `npm run lint` wrapper combining ESLint + Prettier.【F:package.json†L6-L13】
- Align CI: remove bun or run npm in parallel; add Node matrix (20, 22) with caching.【F:.github/workflows/ci.yml†L1-L23】
- Enforce tests & audit in CI/release jobs (`vitest run`, `npm audit --audit-level=high`).【F:.github/workflows/release.yml†L9-L33】
- Revisit `tsconfig`: disable `skipLibCheck` if feasible, enable `noUncheckedIndexedAccess` to catch mapping bugs early.【F:tsconfig.json†L1-L124】
- Keep commitlint job, but document pre-push hook for lint/typecheck/test.

## 7. Zod / OpenAI Migration Plan

1. **Analyse dependency landscape**: once `openai` ≥6 ships with zod v4 peer dependency, test upgrade in a feature branch.【F:README.md†L31-L136】
1. **Prepare dual build**: introduce adapter around `z.safeParse` to isolate breaking changes.【F:src/utils/config.ts†L8-L104】
1. **Integration tests**: run config parsing & PayeeTransformer against zod v4 schema, including negative cases.
1. **Release steps**: publish a minor release with migration notes (config validation error texts). Keep previous version tagged for zod 3 consumers.
1. **Rollback**: if openai/zod combo regresses, restore lockfile + npm dist-tag; update README notice accordingly.【F:README.md†L31-L136】

## 8. Appendix (Logs & Artefacts)

- `npm install` refreshed dependencies (5 moderate advisories remain upstream).【chunk:cfc5fa†L1-L11】
- `npm run lint:eslint` succeeded.【chunk:926f53†L1-L5】
- `npm run lint:prettier` succeeded.【chunk:49ce84†L1-L8】
- `npm run typecheck` succeeded via the dedicated script.【chunk:9f4dd1†L1-L5】
- `npm run build` succeeded.【chunk:4f496d†L1-L5】
- `npm test -- --reporter verbose` now finishes without open handles.【chunk:25b872†L1-L8】
- Targeted `npx vitest run tests/ActualApi.test.ts --reporter verbose` confirms the console patch fix.【chunk:6f7772†L1-L6】
- `npm audit --audit-level=high` highlights the existing esbuild advisory (no non-breaking fix yet).【chunk:4ff116†L1-L25】
