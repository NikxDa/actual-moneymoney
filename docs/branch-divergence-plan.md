# Branch Divergence Analysis & Plan

## 0. Summary Snapshot
- **baseline**: upstream/main @ 77db27d (v2.17.1, 2025-07-20)
- **work branch**: develop @ 3b8b136 (2025-09-26)
- **commits ahead/behind**: 80 / 0
- **files changed / churn**: 26 files / +5,494 -1,570
- **quick recommendation**: **Path B (Fork Graduation)** — This is a substantial fork with 80 commits, comprehensive testing suite, enhanced features, and significant architectural improvements. The scope suggests independent development rather than incremental upstream contributions. **Legal clearance**: Upstream is MIT licensed, so you have full rights to fork and distribute.

## 1. Inventory of Changes (Grouped)

### 1.1 Tooling / CI / Config
- **type**: tooling
- **risk**: low
- **blast_radius**: narrow
- **test_coverage**: exists
- **key files**: `.github/workflows/ci.yml`, `package.json`, `tsconfig.json`, `vitest.config.ts`
- **notes**: Enhanced CI with comprehensive test matrix, added Vitest testing framework, updated dependencies (OpenAI 5.23.0, ESLint 9.36.0, TypeScript 5.9.2), added commitlint validation

### 1.2 Pure Refactors
- **type**: refactor
- **risk**: low
- **blast_radius**: moderate
- **test_coverage**: exists
- **key files**: `src/utils/ActualApi.ts`, `src/utils/Importer.ts`, `src/utils/PayeeTransformer.ts`
- **notes**: Extracted transaction deduplication helpers, improved error handling patterns, enhanced logging with masking capabilities

### 1.3 API Surface Changes
- **type**: api
- **risk**: medium
- **blast_radius**: broad
- **test_coverage**: exists
- **key files**: `src/utils/ActualApi.ts`, `src/types/actual-app__api.d.ts`, `src/utils/config.ts`
- **notes**: Added timeout handling, budget lifecycle management, enhanced error wrapping, new configuration options for server filtering and timeout settings

### 1.4 Features
- **type**: feature
- **risk**: medium
- **blast_radius**: broad
- **test_coverage**: partial
- **key files**: `src/utils/PayeeTransformer.ts`, `src/commands/import.command.ts`, `src/utils/Importer.ts`
- **notes**:
  - Server filtering for imports (`--server` flag)
  - Enhanced OpenAI payee transformation with configurable models
  - Payee log masking for privacy
  - Comprehensive timeout and retry handling
  - Advanced configuration options

### 1.5 Bug Fixes
- **type**: bugfix
- **risk**: low
- **blast_radius**: narrow
- **test_coverage**: exists
- **key files**: `src/utils/ActualApi.ts`, `src/commands/validate.command.ts`, `tests/ActualApi.test.ts`
- **notes**: Fixed Vitest hanging issues, improved timeout handling, enhanced error messages, fixed console patching, resolved import deduplication edge cases

### 1.6 Data / Migrations
- **type**: migration
- **risk**: low
- **blast_radius**: narrow
- **test_coverage**: exists
- **key files**: `src/utils/Importer.ts`, `src/utils/ActualApi.ts`
- **notes**: Enhanced transaction deduplication logic, improved import hash generation, better handling of partial imports

## 2. Risks & Hotspots
- **hotspots**: `src/utils/ActualApi.ts` (536 lines added), `src/utils/PayeeTransformer.ts` (551 lines added), `package-lock.json` (3,783 lines changed)
- **coupling & regressions to watch**: Actual API timeout handling, OpenAI integration, console patching in tests
- **dependency/version concerns**: Pinned zod to v3.25.76 due to OpenAI compatibility, updated to OpenAI 5.23.0

## 3. Path A — Upstream Decomposition Plan

### PR 1: Enhanced Testing Infrastructure
- **scope**: Add Vitest test suite, CI improvements, commitlint
- **rationale**: Foundation for all other changes, improves code quality
- **how to cut**: Cherry-pick commits: `ecc70b0`, `b21d031`, CI workflow changes
- **acceptance criteria**: All tests pass, CI runs successfully
- **tests**: `npm test`, `npm run lint:eslint`, `npm run typecheck`

### PR 2: Configuration and CLI Enhancements
- **scope**: Server filtering, timeout configuration, enhanced validation
- **rationale**: Improves user experience and configurability
- **how to cut**: Cherry-pick commits: `532da23`, `e1efa57`, config changes
- **acceptance criteria**: `--server` flag works, timeout configs apply
- **tests**: Manual testing with different configs

### PR 3: Actual API Robustness Improvements
- **scope**: Timeout handling, budget lifecycle, error wrapping
- **rationale**: Critical stability improvements
- **how to cut**: Cherry-pick commits: `c298c27`, `17e39ff`, `b1e8835`
- **acceptance criteria**: Timeouts work correctly, budget sync completes
- **tests**: `tests/ActualApi.test.ts` timeout scenarios

### PR 4: Payee Transformation Enhancements
- **scope**: OpenAI improvements, log masking, model configuration
- **rationale**: Privacy and functionality improvements
- **how to cut**: Cherry-pick commits: `08695e1`, `e214975`, `93e4168`
- **acceptance criteria**: Payee masking works, OpenAI requests are robust
- **tests**: `tests/PayeeTransformer.test.ts`

### PR 5: Import Logic Improvements
- **scope**: Transaction deduplication, import hash improvements
- **rationale**: Prevents duplicate imports, improves reliability
- **how to cut**: Cherry-pick commits: `ff58440`, `57d9b3a`, `98753d8`
- **acceptance criteria**: No duplicate transactions, reliable imports
- **tests**: `tests/Importer.test.ts`

### PR 6: Documentation and Examples
- **scope**: README updates, example configurations, deep review docs
- **rationale**: Improves user onboarding and maintenance
- **how to cut**: Cherry-pick commits: `c241f03`, `7cf2250`, documentation changes
- **acceptance criteria**: Documentation is accurate and helpful
- **tests**: Manual review of documentation

## 4. Path B — Fork Graduation Plan

### 4.1 Choose baseline strategy
- **option**: squash baseline (pros: clean history, cons: lose detailed commit history)
- **option**: keep history (pros: preserve development context, cons: complex history)
- **recommendation**: **keep history** — The 80 commits show valuable development progression and debugging insights

### 4.2 Steps
- **branch/force-push commands (safe)**:
  ```bash
  # Create new main from develop
  git checkout develop
  git checkout -b main-new
  git push origin main-new

  # After verification, replace main
  git checkout main
  git reset --hard develop
  git push origin main --force-with-lease
  ```
- **README/LICENSE updates**: Update author attribution, add fork notice, update installation instructions (MIT license is inherited from upstream)
- **CI, release tagging (v0.1.0)**: Update version to v0.1.0, create release workflow, add semantic versioning
- **optional upstream-sync policy**: Document how to cherry-pick upstream fixes, set up upstream remote tracking

## 5. Testing & CI Plan
- **unit/integration/e2e to add or update**:
  - Add integration tests for full import workflow
  - Add E2E tests for CLI commands
  - Add performance tests for large datasets
- **minimal CI matrix**: Node.js 20.x, 22.x; macOS; lint, typecheck, build, test
- **data migration & rollback notes**: No schema changes, but document timeout configuration migration

## 6. Decisions Needed (NEEDS-USER-INPUT)
- **Version numbering strategy**: Start at v0.1.0 or continue from v2.17.1? (default recommendation: v0.1.0 for clean fork) --> Decision: v0.1.0
- **Upstream sync policy**: How often to check for upstream changes? (default recommendation: quarterly reviews) --> quarterly reviews
- **Release cadence**: Monthly, quarterly, or on-demand? (default recommendation: on-demand with semantic versioning) --> on-demand
- **Documentation hosting**: GitHub Pages, separate docs site, or README-only? (default recommendation: enhanced README) --> enhanced README

## 7. Actionable Checklist
- [ ] **Step 1**: Create backup branch (`git checkout -b backup-develop`)
- [ ] **Step 2**: Update package.json version to v0.1.0
- [ ] **Step 3**: Update README with fork attribution and new features
- [ ] **Step 4**: Create LICENSE file (inherit MIT from upstream, add your attribution)
- [ ] **Step 5**: Update CI workflows for independent releases
- [ ] **Step 6**: Create first release tag (v0.1.0)
- [ ] **Step 7**: Set up upstream remote tracking
- [ ] **Step 8**: Document upstream sync process
- [ ] **Step 9**: Run full test suite and verify all functionality
- [ ] **Step 10**: Create initial changelog from commit history
