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
- Follow existing naming patterns (`*.command.ts` for CLI commands, PascalCase for classes, camelCase for variables/functions).
- When adding new configuration options or command-line flags, update relevant TOML schema/validation and documentation (e.g., `README.md`).

## Testing & Tooling
Run the following commands before committing changes:
1. `npm run lint:eslint`
2. `npm run lint:prettier`
3. `npm run build`

These checks ensure linting, formatting, and TypeScript compilation succeed.

## Commit Messages
- Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification so that commitlint accepts new commits.
- Start messages with a valid **type** (e.g., `feat`, `fix`, `docs`, `chore`) followed by a colon and a short, imperative **subject** (e.g., `fix: add budget syncing retries`).
- For changes that include multiple scopes, you may include an optional scope in parentheses (e.g., `feat(sync): improve account mapping`).
- Keep the subject under 72 characters and avoid ending it with a period.

## Additional Notes
- Node.js version 18 or newer is required.
- Example configurations live at `example-config-advanced.toml` and should stay in sync with config schema changes.
- Assets (logos, etc.) reside in `/assets`; update paths carefully if moving files referenced in the README.
