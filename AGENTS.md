# Contributing Guidelines for `actual-moneymoney`

## Project Overview

- This repository contains a TypeScript CLI that synchronises MoneyMoney data into Actual Budget.
- Entry point: `src/index.ts` (bundled to `dist/index.js` via `npm run build`).
- Core subsystems:
  - `src/commands/`: individual yargs command modules (`*.command.ts`).
  - `src/utils/`: shared helpers for API access, logging, importing, configuration, etc.
  - `src/types/`: shared TypeScript type declarations.

## Documentation Structure

This project uses a distributed documentation approach with specific guidelines for different areas:

### 📁 [src/AGENTS.md](src/AGENTS.md) - Source Code Guidelines

- **Command Module Patterns**: CLI command implementation with yargs integration
- **Configuration Patterns**: TOML configuration management with Zod validation
- **Utility Class Patterns**: Logger, API clients, data transformation utilities
- **API Integration Patterns**: Actual Budget, MoneyMoney, and OpenAI integration
- **Source Code Standards**: TypeScript conventions, import/export patterns, error handling

### 🧪 [tests/AGENTS.md](tests/AGENTS.md) - Testing Guidelines

- **Testing Patterns**: Vitest framework usage, test organization, mocking
- **Test Structure**: File naming, organization, and coverage requirements
- **Pre-commit Checks**: Quality assurance workflow
- **Test Maintenance**: Keeping tests in sync with source changes

## Development Workflow

### Pre-commit Checks

Run the following commands before committing changes so local development matches CI:

1. `npm run lint:eslint`
1. `npm run lint:prettier`
1. `npm run typecheck`
1. `npm run build`
1. `npm test`

These checks ensure code quality, formatting, type safety, build output, and automated tests remain healthy.

### Available Scripts

- **Build**: `npm run build` - Compile TypeScript to JavaScript
- **Type Check**: `npm run typecheck` - Check types without emitting files
- **Lint**: `npm run lint:eslint` - ESLint code quality checks
- **Format**: `npm run lint:prettier` - Check code formatting
- **Format Fix**: `npm run lint:prettier:fix` - Auto-fix formatting issues
- **Test**: `npm test` - Run test suite
- **Start**: `npm start` - Run the compiled application

## Quick Start

### For Source Code Development

See [src/AGENTS.md](src/AGENTS.md) for:

- Command implementation patterns
- Configuration management
- API integration guidelines
- TypeScript coding standards

### For Testing

See [tests/AGENTS.md](tests/AGENTS.md) for:

- Test organization and structure
- Mocking patterns
- Coverage requirements
- Test maintenance practices

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
