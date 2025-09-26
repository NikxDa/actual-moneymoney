# Source Code Guidelines for `actual-moneymoney`

## Command Module Patterns

All commands follow this pattern in [src/commands/](mdc:src/commands/):

### Available Commands

- `import`: Import transactions from MoneyMoney to Actual Budget
- `validate`: Validate and create configuration files

### Command Structure

```typescript
import { ArgumentsCamelCase, CommandModule } from 'yargs';

const handleCommand = async (argv: ArgumentsCamelCase) => {
    // Command implementation
};

export default {
    command: 'command-name',
    describe: 'Command description',
    builder: (yargs) => {
        // yargs options configuration
    },
    handler: (argv) => handleCommand(argv),
} as CommandModule;
```

### Command Implementation Guidelines

- **Async Handlers**: All command handlers should be async functions
- **Configuration Loading**: Use `getConfig(argv)` to load and validate configuration
- **Logging**: Create logger instance with `new Logger(logLevel)`
- **Error Handling**: Provide meaningful error messages with context
- **Validation**: Validate command arguments before processing

### Yargs Integration

- Use `ArgumentsCamelCase` type for argv parameter
- Configure options in the `builder` function
- Use descriptive option names and descriptions
- Support both kebab-case and camelCase for options (e.g., `--dry-run` and `--dryRun`)

### Common Patterns

- **Date Parsing**: Use `parse()` from date-fns with [DATE_FORMAT](mdc:src/utils/shared.ts)
- **Array Handling**: Support both single values and arrays for filters
- **Server/Budget Filtering**: Validate against configured servers and budgets
- **Dry Run Support**: Implement `--dry-run` flag for safe testing

### Error Messages

- Use consistent error message format
- Include relevant context (server URLs, budget IDs, etc.)
- Provide actionable guidance for fixing issues

## Configuration Patterns

The application uses TOML configuration files with Zod validation.

### Configuration Schema

- **Location**: [src/utils/config.ts](mdc:src/utils/config.ts)
- **Default Path**: `~/.actually/config.toml`
- **Validation**: Zod schemas with descriptive error messages
- **Types**: Exported TypeScript types from Zod schemas

### Configuration Structure

```typescript
// Schema definition
export const configSchema = z.object({
    payeeTransformation: payeeTransformationSchema,
    import: importConfigSchema,
    actualServers: z.array(actualServerSchema).min(1),
});

// Type inference
export type Config = z.infer<typeof configSchema>;
```

### Configuration Loading

- Use `getConfig(argv)` to load configuration
- Handle missing config files gracefully
- Provide clear error messages for validation failures
- Support custom config paths via `--config` option

### Validation Patterns

- Use Zod for runtime validation
- Provide custom error messages for better UX
- Validate cross-field dependencies with `superRefine()`
- Handle TOML parsing errors with line/column information

### Default Configuration

- Generate default config in [src/utils/shared.ts](mdc:src/utils/shared.ts)
- Keep example configs in sync with schema changes
- Update documentation when adding new options

### Configuration Error Handling

- Distinguish between TOML parsing errors and validation errors
- Provide actionable error messages
- Include file path and line numbers for parsing errors
- Format Zod validation errors clearly

## Utility Class Patterns

### Logger Utility

The [Logger](mdc:src/utils/Logger.ts) class provides consistent logging across the application.

#### Usage Patterns

```typescript
import Logger, { LogLevel } from './Logger.js';

const logger = new Logger(LogLevel.INFO);
logger.info('Message', ['hint1', 'hint2']);
logger.error('Error message');
logger.debug('Debug information');
```

#### Log Levels

- `ERROR` (0): Critical errors
- `WARN` (1): Warnings
- `INFO` (2): General information
- `DEBUG` (3): Detailed debugging

### API Client Patterns

#### ActualApi Class

- Initialize with server configuration and logger
- Handle connection lifecycle (init, loadBudget, shutdown)
- Implement proper error handling and timeouts
- Use console state management for testing

#### PayeeTransformer Class

- AI-powered payee name transformation
- OpenAI integration with configurable models
- Caching and error handling
- Log redaction for sensitive data

### Data Transformation

#### AccountMap Class

- Maps MoneyMoney accounts to Actual accounts using configuration
- Handles account creation and synchronization
- Provides account lookup functionality with ref-based filtering
- Supports custom account mapping via configuration
- Manages account type mapping (checking, savings, credit, etc.)

#### Importer Class

- Core import logic for transactions with pattern matching
- Handles date filtering and account mapping
- Supports dry-run mode for testing
- Integrates with PayeeTransformer for AI-powered payee cleaning
- Implements ignore patterns for comments, payees, and purposes
- Supports transaction status synchronization (cleared/uncleared)

### Configuration Utilities

#### Config Loading

- TOML parsing with error handling
- Zod validation with descriptive errors
- Support for custom config paths
- Default configuration generation

#### Shared Constants

- Date formats and application directories
- Default timeouts and configuration values
- Example configuration templates

### Error Handling Patterns

- Use try/catch blocks for async operations
- Provide context in error messages
- Log errors with appropriate levels
- Handle external API failures gracefully

## API Integration Patterns

### Actual Budget API

#### Connection Management

- Use [ActualApi](mdc:src/utils/ActualApi.ts) class for all Actual Budget interactions
- Initialize with server configuration and logger
- Handle connection lifecycle: `init()` → `loadBudget()` → operations → `shutdown()`
- Implement proper timeout handling and error recovery

#### Budget Operations

```typescript
const actualApi = new ActualApi(serverConfig, logger);
await actualApi.init();
await actualApi.loadBudget(budgetSyncId);
// Perform operations
await actualApi.shutdown();
```

#### Transaction Import

- Use `importTransactions()` for bulk transaction imports
- Handle duplicate detection and conflict resolution
- Support dry-run mode for testing
- Implement proper error handling for API failures

### MoneyMoney Integration

#### Database Access

- Use `checkDatabaseUnlocked()` to verify MoneyMoney accessibility
- Handle locked database scenarios gracefully
- Provide clear error messages for access issues

#### Data Extraction

- Extract accounts and transactions from MoneyMoney database
- Handle different account types and transaction formats
- Support date range filtering for imports

### OpenAI Integration

#### Payee Transformation

- Use [PayeeTransformer](mdc:src/utils/PayeeTransformer.ts) for AI-powered payee name cleaning
- Implement caching to reduce API calls
- Handle API failures gracefully with fallback to original names
- Mask sensitive data in logs when configured

#### Configuration

- Support configurable OpenAI models and parameters
- Implement timeout handling for API calls
- Provide custom prompt support for specialized use cases

### API Error Handling

#### Network Errors

- Implement retry logic for transient failures
- Handle timeout scenarios appropriately
- Provide user-friendly error messages

#### Data Validation

- Validate data before API calls
- Handle malformed responses gracefully
- Log errors with appropriate detail levels

## Source Code Standards

### TypeScript Standards

- Use modern TypeScript with ECMAScript modules (`import ... from './module.js'`)
- Indent using **4 spaces** (not tabs) - match existing code style
- **Line Length**: Maximum 80 characters (Prettier enforced)
- **Semicolons**: Always use semicolons
- **Quotes**: Single quotes for strings
- **Trailing Commas**: ES5 style (objects and arrays)
- Prefer explicit types for function parameters/returns when not inferred from obvious context
- Use `PascalCase` for classes, `camelCase` for variables and functions
- Follow existing naming patterns (`*.command.ts` for CLI commands)

### Import/Export Patterns

- Use ES modules with `.js` extensions in imports (TypeScript requirement)
- Group imports: external packages first, then internal modules
- Use named exports when possible, default exports for main classes

### Error Handling

- Use the `Logger` utility instead of `console.log` directly
- Provide meaningful error messages with context
- Handle async operations with proper try/catch blocks
- Use Zod for runtime validation with descriptive error messages

### Configuration Updates

- When adding new configuration options or command-line flags, update:
  - TOML schema/validation in `src/utils/config.ts`
  - Generated default config in `src/utils/shared.ts`
  - Documentation (README.md, example-config-advanced.toml)

## Advanced Patterns

### E2E Encryption Support

- Handle encrypted Actual Budget connections with password-based encryption
- Support both encrypted and unencrypted budget configurations
- Implement proper error handling for encryption failures

### Pattern Matching and Filtering

- Use regex patterns for transaction filtering (comments, payees, purposes)
- Implement caching for compiled regex patterns
- Support case-insensitive pattern matching
- Handle pattern compilation errors gracefully

### Console State Management

- Suppress noisy Actual API console output during testing
- Restore console state after API operations
- Use console spies for testing without affecting production logs

### Caching Strategies

- Implement file-based caching for OpenAI responses
- Use temporary directories for test isolation
- Handle cache invalidation and cleanup
- Support configurable cache locations
