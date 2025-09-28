# Contributing Guidelines for `actual-moneymoney`

## Project overview

- TypeScript CLI that synchronises MoneyMoney accounts and transactions into Actual Budget.
- Entry point: [`src/index.ts`](src/index.ts) wires CLI options and registers command modules.
- Distribution build: `npm run build` emits ESM output into `dist/` and is used by the published binary (`bin.actual-monmon`).

## Repository layout

| Path                           | Purpose                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                         | CLI commands, utilities, shared constants, and internal type augmentations. Use ESM-style imports that include the `.js` extension when referencing other source files. |
| `tests/`                       | Vitest unit tests that mirror the source structure (`ActualApi`, `Importer`, `PayeeTransformer`, `config`).                                                             |
| `docs/`                        | Engineering process notes (e.g. upstream sync, review checklists). Keep them up to date if workflow changes.                                                            |
| `assets/`                      | Images referenced from the README. Update paths in documentation when changing assets.                                                                                  |
| `example-config-advanced.toml` | Configuration example that must stay in sync with the Zod schema in `src/utils/config.ts` and the README.                                                               |

## Development workflow

1. Ensure Node.js **v20.9.0** or newer (see the `engines` field in `package.json`).
2. Install dependencies with `npm install`.
3. Run the quality gates from the repository root:
    - `npm run lint:eslint`
    - `npm run lint:complexity`
    - `npm run lint:prettier`
    - `npm run typecheck`
    - `npm run build`
    - `npm test`

    Tests are meant to cover the most important paths; we do not require or aim for 100% coverage. Keep the critical scenarios
    healthy and feel free to trim suites that provide little value.

These commands are the same ones used in CI; keeping them green locally avoids surprises.

### Source updates

- Configuration changes require updates to:
    - `src/utils/config.ts`
    - `src/utils/shared.ts`
    - `example-config-advanced.toml`
    - `README.md`
    - Relevant tests in `tests/config.test.ts`
- When adding new CLI functionality, mirror the existing command pattern under `src/commands/` and provide coverage in the corresponding `tests/` file.
- Internal API augmentations live in `src/types/`. Update them if the Actual SDK surface area changes.

### Documentation

- The README documents installation, configuration, and command usage. Update it whenever behaviour changes.
- Process documentation in `docs/` should continue to describe the actual workflow (upstream sync process, review expectations, etc.).

## Commit messages

- Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification so that commitlint accepts new commits.
- Start messages with a valid **type** (e.g., `feat`, `fix`, `docs`, `chore`) followed by an imperative subject (e.g., `fix: add budget syncing retries`).
- Keep the subject under 72 characters and avoid ending it with a period.
