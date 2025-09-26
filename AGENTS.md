# Contributing Guidelines for `actual-moneymoney`

## Project Overview

- This repository contains a TypeScript CLI that synchronises MoneyMoney data into Actual Budget.
- Entry point: `src/index.ts` (bundled to `dist/index.js` via `npm run build`).
- Core subsystems:
  - `src/commands/`: individual yargs command modules (`*.command.ts`).
  - `src/utils/`: shared helpers for API access, logging, importing, configuration, etc.
  - `src/types/`: shared TypeScript type declarations.

## Coding Conventions

- Use modern TypeScript with ECMAScript modules (`import ... from './module.js'`).
- Indent using **4 spaces** (match existing code style).
- Prefer explicit types for function parameters/returns when not inferred from obvious context.
- Keep logging consistent by using the `Logger` utility instead of `console.log` directly.
- Follow existing naming patterns (`*.command.ts` for CLI commands, `PascalCase` for classes, `camelCase` for variables and functions).
- When adding new configuration options or command-line flags, update the TOML schema/validation in `src/utils/config.ts`, the generated default config in `src/utils/shared.ts`, and relevant documentation (e.g., `README.md`, `example-config-advanced.toml`).

## Testing & Tooling

Run the following commands before committing changes so local development matches CI:

1. `npm run lint:eslint`
2. `npm run lint:prettier`
3. `npm run typecheck`
4. `npm run build`
5. `npm test`

These checks ensure code quality, formatting, type safety, build output, and automated tests remain healthy.

## Commit Messages

- Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification so that commitlint accepts new commits.
- Start messages with a valid **type** (e.g., `feat`, `fix`, `docs`, `chore`) followed by a colon and a short, imperative **subject** (e.g., `fix: add budget syncing retries`).
- For changes that include multiple scopes, you may include an optional scope in parentheses (e.g., `feat(sync): improve account mapping`).
- Keep the subject under 72 characters and avoid ending it with a period.

## Additional Notes

- Node.js v20.9.0 or newer is required (see `package.json` `engines` field).
- Default configuration files live in `~/.actually/config.toml`. Keep the example config defined in `src/utils/shared.ts` aligned with the validation schema.
- Example configurations such as `example-config-advanced.toml` should stay in sync with config schema changes and README documentation.
- Assets (logos, etc.) reside in `/assets`; update paths carefully if moving files referenced in the README.
