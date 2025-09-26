# Deep Review – actual-moneymoney (develop)

## 1. Executive Summary
The importer has solid foundations but fails at critical integration points: budgets are downloaded yet never loaded, the `validate` command cannot create new configuration paths, and the Vitest suite hangs because open handles remain. Robust error paths against the Actual server and OpenAI are missing. Documentation promises quality-of-life features (e.g., automatic config generation) that the code only partially delivers. Priority is to stabilise the API layer, followed by DX improvements and CI coverage of the real-world workflow.

**5-Point Action Plan**
1. Fix the budget lifecycle (download → load → sync) and add error/timeout handling in the Actual adapter.
2. Harden the CLI configuration path (recursive directory creation, actionable error messages).
3. Identify the root cause for the Vitest hang, ship a hotfix, then enforce tests in CI.
4. Strengthen OpenAI/secret handling (timeouts, response validation, log redaction, cache TTL documentation).
5. Align the toolchain (npm vs. bun), add a typecheck script, and secure the release flow with tests/audit gates.

## 2. Bug List
| ID | Category | File:Line | Short Description | Repro Steps | Expected vs. Current Behaviour | Fix Proposal |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Bug | `src/utils/ActualApi.ts:113-135` | Budget is downloaded but never loaded; subsequent calls read stale/empty data.【F:src/utils/ActualApi.ts†L113-L158】 | 1. Start with empty data directory (`~/.actually/actual-data`). 2. Run `actual-monmon import --budget <id>`. 3. `getAccounts` returns empty/stale data because no budget is active.【F:src/utils/ActualApi.ts†L105-L158】 | Expected: after `downloadBudget`, the budget is loaded into the session (`loadBudget`) and synced. Actual: session has no active budget, so mappings/transactions fail. | Call `actual.loadBudget` and optionally `actual.sync()` after download; wrap failure paths with logger.【F:node_modules/@actual-app/api/dist/methods.js†L72-L104】 |
| B2 | Bug | `src/commands/validate.command.ts:22-29` | `validate` writes config files but does not create parent directories.【F:src/commands/validate.command.ts†L22-L29】 | 1. Run `actual-monmon validate --config ./tmp/custom/config.toml` in an empty project. 2. Command fails with `ENOENT`. | Expected: path is created recursively and example config written (README promise). Actual: write attempt aborts. | Call `fs.mkdir(path.dirname(configPath), { recursive: true })` before `writeFile` and log errors clearly.【F:README.md†L40-L44】 |
| B3 | Bug | Test suite (`vitest`) | Test run never exits, process hangs (open handles). | 1. Run `npm test` or `npx vitest run`. 2. Run stops after `PayeeTransformer` output, hangs on `ActualApi` tests, requires manual `Ctrl+C`.【chunk:41e2c1†L1-L8】【chunk:995742†L1-L10】【chunk:4d4768†L1-L1】 | Expected: Vitest exits automatically. Actual: at least one handle remains open (likely console patching), so CI blocks. | Debug with `vitest --run --reporter verbose --logHeapUsage`, inspect console patching (`suppressConsoleLog`), add `afterAll` cleanup/`actual.shutdown` mocks. Gate CI on deterministic runs. |

## 3. Design / Architecture Findings
- **Actual API robustness**: `getUserToken`/`getUserFiles` never check `response.ok`, so network failures throw vague JSON errors.【F:src/utils/ActualApi.ts†L174-L217】 Add timeouts, status checks, and redact sensitive payloads in logs.
- **Global console manipulation**: `suppressConsoleLog` overrides global loggers; concurrent calls risk lost logs and likely explain the Vitest hang.【F:src/utils/ActualApi.ts†L228-L239】 Prefer scoped loggers or `actual.setLogListener`.
- **Dead code**: `ActualApi.api` field and `getUserFiles` are unused—signalling unfinished file-browsing features and potential maintenance burden.【F:src/utils/ActualApi.ts†L53-L217】
- **OpenAI coupling**: `PayeeTransformer` stores the model cache in plain text and logs payees at debug level (privacy leak).【F:src/utils/PayeeTransformer.ts†L92-L188】 Add masking/redaction even for debug logs.
- **Starting balance heuristic**: For empty MoneyMoney slices the importer still creates a starting transaction from the current balance, causing jumps on partial imports.【F:src/utils/Importer.ts†L175-L199】 Add a guard or user-facing warning.

## 4. Refactor Backlog
**Epic A – Harden Actual adapter**
*Target state:* Stable import across multiple budgets/servers and transient server failures.
*Acceptance criteria:* Budget loads post-download, sync/retry on 5xx/timeout, console patching removed.
*Risks:* Changes to global logging, tests/mocks need updates.
- Story A1 (M): integrate `loadBudget` + `sync`, secure shutdown in `finally`.【F:src/utils/ActualApi.ts†L113-L170】
- Story A2 (M): refactor `suppressConsoleLog` into scoped logger or `actual.setLogListener`, add tests guarding against open handles.【F:src/utils/ActualApi.ts†L228-L239】
- Story A3 (S): wrap HTTP fetches with `AbortController`, status checks, and sensitive log redaction.【F:src/utils/ActualApi.ts†L174-L217】

**Epic B – CLI & Config DX**
*Target state:* Users can create/validate configs anywhere.
*Acceptance criteria:* `validate` creates paths, error text offers guidance, README stays in sync.
*Risks:* Path handling on Windows/macOS.
- Story B1 (S): recursive `mkdir` before `writeFile`, add tests for success/error paths.【F:src/commands/validate.command.ts†L22-L29】
- Story B2 (S): document CLI option normalisation (`--server`, `--budget`) and add tests for filter logic.【F:src/commands/import.command.ts†L84-L200】

**Epic C – Test/CI hardening**
*Target state:* Deterministic tests locally and in CI (Node 20/22).
*Acceptance criteria:* `npm test` exits, coverage ≥80 % for importer pipeline.
*Risks:* MoneyMoney/Actual mocks more complex.
- Story C1 (M): analyse open handles (console patch, fs handles), add Vitest cleanup.【chunk:995742†L1-L10】
- Story C2 (M): add integration tests for importer pipeline (mock MoneyMoney + Actual) covering dedupe/start balance.【F:src/utils/Importer.ts†L27-L210】
- Story C3 (S): extend GitHub Actions with test/typecheck/audit, consolidate bun→npm usage.【F:.github/workflows/ci.yml†L1-L23】【F:package.json†L6-L13】

**Quick Wins (<1 day)**
- Add missing `npm run typecheck` script and update README.【F:package.json†L6-L13】
- Allow masking toggle for `PayeeTransformer` debug logs.【F:src/utils/PayeeTransformer.ts†L110-L188】
- Remove `getUserFiles` or document feature flag to reduce dead code.【F:src/utils/ActualApi.ts†L174-L217】

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
2. **Prepare dual build**: introduce adapter around `z.safeParse` to isolate breaking changes.【F:src/utils/config.ts†L8-L104】
3. **Integration tests**: run config parsing & PayeeTransformer against zod v4 schema, including negative cases.
4. **Release steps**: publish a minor release with migration notes (config validation error texts). Keep previous version tagged for zod 3 consumers.
5. **Rollback**: if openai/zod combo regresses, restore lockfile + npm dist-tag; update README notice accordingly.【F:README.md†L31-L136】

## 8. Appendix (Logs & Artefacts)
- `npm ci` succeeded (warning: 5 moderate vulnerabilities).【chunk:48865d†L1-L12】
- `npm run lint` missing script (error).【chunk:ee78ff†L1-L10】
- `npm run lint:eslint` succeeded.【chunk:f1777f†L1-L6】
- `npm run lint:prettier` succeeded.【chunk:3ee0ab†L1-L8】
- `npm run typecheck` missing; manual `npx tsc --noEmit` succeeded.【chunk:5702ff†L1-L7】【chunk:7f8aa1†L1-L2】
- `npm test` / `npx vitest run` hang on `ActualApi` tests (manual abort).【chunk:41e2c1†L1-L8】【chunk:995742†L1-L10】【chunk:4d4768†L1-L1】
- Single test `npx vitest run tests/ActualApi.test.ts` succeeds, confirming hotspot.【chunk:451870†L1-L5】【chunk:c60f57†L1-L5】【chunk:4f8db5†L1-L6】
- `npm run build` succeeded.【chunk:d75743†L1-L5】
- `npm audit --audit-level=high` reports known `esbuild` issue (moderate).【chunk:76f53b†L1-L23】
