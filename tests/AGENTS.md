# Testing Guidelines for `actual-moneymoney`

## Testing & Tooling

### Pre-commit Checks

Run the following commands before committing changes so local development matches CI:

1. `npm run lint:eslint`
1. `npm run lint:prettier`
1. `npm run typecheck`
1. `npm run build`
1. `npm test`

These checks ensure code quality, formatting, type safety, build output, and automated tests remain healthy.

### Testing Patterns

Tests are located in [tests/](mdc:tests/) directory using Vitest framework.

#### Test Structure

- **Test Files**: `*.test.ts` (e.g., `ActualApi.test.ts`)
- **Organization**: Test files mirror source structure
- **Naming**: Use descriptive test file names matching the module being tested

#### Test Organization

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
    beforeEach(() => {
        // Setup
    });

    afterEach(() => {
        // Cleanup
    });

    it('should do something specific', () => {
        // Test implementation
    });
});
```

#### Mocking Patterns

- Use `vi.mock()` for module mocking
- Create mock implementations for external dependencies
- Reset mocks in `beforeEach` hooks
- Use `vi.fn()` for function mocks

#### Test Utilities

- Create helper functions for common test setup
- Use factory functions for creating test data
- Mock the `Logger` class for consistent testing
- Use `vi.fn()` for mock implementations

#### Assertion Patterns

- Use `expect()` for assertions
- Test both success and error cases
- Verify mock calls with `toHaveBeenCalledWith()`
- Test async operations with proper await handling

#### Coverage Requirements

- Aim for high test coverage on critical business logic
- Test error handling paths
- Include integration tests for API interactions
- Test configuration validation thoroughly

### Test Maintenance

Whenever a source file is modified, review and update the relevant automated tests to cover the change. If a bug is fixed, add a regression test when feasible to prevent the issue from reoccurring.

## Test-Specific Coding Standards

### Test File Organization

- Mirror the source directory structure in the tests directory
- Use descriptive test file names that match the module being tested
- Group related tests using `describe` blocks
- Use clear, descriptive test names that explain the expected behavior

### Mocking Best Practices

- Mock external dependencies at the module level
- Use `vi.fn()` for function mocks with proper return values
- Reset mocks between tests to avoid test interference
- Create mock implementations that match the real API interface

### Test Data Management

- Use factory functions to create test data
- Keep test data minimal and focused on the test case
- Use meaningful test data that reflects real-world scenarios
- Avoid hardcoded values where possible

### Async Testing

- Always use `await` when testing async operations
- Test both success and error scenarios for async functions
- Use proper timeout handling for long-running operations
- Mock async dependencies appropriately

## Advanced Testing Patterns

### Mocking External APIs

- Mock OpenAI API responses with realistic data structures
- Use `vi.hoisted()` for shared mock data across tests
- Implement mock classes that match real API interfaces
- Test API error scenarios and timeout handling

### File System Testing

- Use temporary directories for test isolation
- Clean up test files in `afterEach` hooks
- Mock file system operations when testing configuration loading
- Test both success and failure scenarios for file operations

### Console Testing

- Use `vi.spyOn(console, 'log')` to test logging behavior
- Verify console output suppression during API operations
- Test that console state is properly restored after operations
- Mock noisy external library output

### Configuration Testing

- Test TOML parsing with valid and invalid configurations
- Verify Zod validation with various error scenarios
- Test configuration loading with missing files
- Validate cross-field dependencies in configuration schemas

### Integration Testing

- Test complete workflows from command to API calls
- Mock external dependencies while testing internal logic
- Verify proper error handling across component boundaries
- Test data transformation pipelines end-to-end
