# Contributing to Actual-MoneyMoney

Thanks for helping improve Actual-MoneyMoney! This guide explains how to get set up, run the quality checks, and collaborate smoothly with the team.

## Prerequisites

- **Node.js v20.9.0 or newer** – matches the `engines` field in `package.json`.
- **npm** – ships with Node and is used for dependency management and local scripts.
- **MoneyMoney (macOS)** – only required when exercising the importer against a real database.

## Local Setup

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/1cu/actual-moneymoney.git
   cd actual-moneymoney
   npm install
   ```
2. Copy or create a configuration file as needed (see [`example-config-advanced.toml`](./example-config-advanced.toml) for reference).
3. Run the smoke checks to confirm your environment is ready:
   ```bash
   npm run ci:local
   ```
   This chains the linting, type checking, build, and test scripts that run in CI. Keep the suite green before pushing.

## Daily Development Workflow

- Create a feature branch from `develop` (or the requested base branch) before making changes.
- Implement your changes and keep commits focused. Follow [Conventional Commits](https://www.conventionalcommits.org/) so commitlint accepts the history (e.g., `feat: add importer telemetry`).
- Re-run the smoke checks (`npm run ci:local`) to verify linting, formatting, type safety, builds, and tests.
- Update documentation alongside behaviour changes. Configuration updates usually involve:
  - [`src/utils/config.ts`](./src/utils/config.ts)
  - [`src/utils/shared.ts`](./src/utils/shared.ts)
  - [`example-config-advanced.toml`](./example-config-advanced.toml)
  - [`README.md`](./README.md)
  - [`tests/config.test.ts`](./tests/config.test.ts)
- Include or update Vitest coverage for changed logic under `tests/`.
- Open a pull request with a clear summary of the changes and any manual verification performed.

## Helpful npm Scripts

| Script | Purpose |
| --- | --- |
| `npm run lint:eslint` | Run ESLint against the TypeScript sources. |
| `npm run lint:complexity` | Enforce the cyclomatic (max 40) and cognitive (max 60) complexity budgets. |
| `npm run lint:prettier` | Check formatting with Prettier. |
| `npm run typecheck` | Perform a strict TypeScript type check without emitting files. |
| `npm run build` | Compile the CLI for distribution. |
| `npm test` | Execute the Vitest suite. |
| `npm run ci:local` | Run the complete smoke test locally (linting, formatting, type checks, build, tests). |

## Style and Tooling Notes

- The project uses the ESM module system. When importing internal modules, include the `.js` extension (e.g., `import Logger from './Logger.js';`).
- TypeScript files are formatted with Prettier (4-space indentation, single quotes, semicolons). Use `npm run lint:prettier:fix` to format automatically.
- Husky hooks guard the commit and push flows:
  - `pre-commit` runs the linting, complexity, and formatting checks.
  - `pre-push` runs the full smoke test. Fix issues locally before retrying the push.
- When a function approaches the 40/60 complexity limits, break the logic into smaller helpers or extract pure utilities so the
  check stays green.
- When working with OpenAI-powered payee transformation, avoid logging raw payee names if masking is enabled.

## Questions or Support

If you hit an issue with the setup or importer behaviour:

- Consult the [README](./README.md) for configuration and usage guidance.
- Review the Vitest suites in [`tests/`](./tests) for examples of expected behaviour.
- File an issue or start a discussion in the repository with details about your environment, logs, and reproduction steps.

We appreciate your contributions and attention to quality—thank you!
