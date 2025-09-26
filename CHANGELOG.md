# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-26

### Added
- **Comprehensive Testing Suite**: Full Vitest test suite with 11 passing tests
  - `ActualApi.test.ts`: 6 tests covering API lifecycle, timeouts, and error handling
  - `Importer.test.ts`: 1 test for import functionality
  - `PayeeTransformer.test.ts`: 4 tests for OpenAI integration and payee transformation
- **Enhanced Timeout Management**: Configurable request timeouts with proper cleanup
  - Default 45s timeout, maximum 5 minutes
  - Proper client shutdown on timeouts
  - Console state restoration after timeouts
- **Privacy Protection**: Payee log masking to protect sensitive financial data
  - Configurable log masking toggle
  - Debug-level privacy protection
- **Server Filtering**: Import specific accounts from selected MoneyMoney servers
  - `--server` command-line flag
  - TOML configuration support
- **Enhanced OpenAI Integration**: Improved AI-powered payee transformation
  - Configurable GPT models (gpt-4o, gpt-4o-mini, gpt-3.5-turbo)
  - Better error handling and retry mechanisms
  - Temperature configuration for model responses
- **Advanced Configuration**: Extended TOML configuration options
  - Timeout settings per server
  - Enhanced validation with better error messages
  - Example advanced configuration file
- **Robust Import Logic**: Enhanced transaction deduplication and retry mechanisms
  - Improved import hash generation
  - Better handling of partial imports
  - Fallback import strategies
- **Better Logging**: Structured logging with proper error reporting
  - Enhanced debug information
  - Better error messages and context
  - Improved console output formatting
- **CI/CD Improvements**: Enhanced GitHub Actions workflows
  - Comprehensive test matrix
  - Automated linting and type checking
  - Improved release automation
- **Documentation**: Extensive documentation improvements
  - Enhanced README with fork attribution
  - Deep review documentation
  - Upstream sync process documentation
  - Contributing guidelines

### Changed
- **Version**: Reset to v0.1.0 for clean fork graduation
- **Dependencies**: Updated to latest versions
  - OpenAI 5.23.0 (from 5.16.0)
  - ESLint 9.36.0 (from 9.34.0)
  - TypeScript 5.9.2
  - Vitest 2.1.4 for testing
- **Package.json**: Updated version and enhanced scripts
- **CI Workflows**: Improved GitHub Actions with comprehensive testing
- **Error Handling**: More robust error handling throughout the application
- **API Surface**: Enhanced Actual API integration with better lifecycle management

### Fixed
- **Vitest Hanging**: Fixed test suite hanging issues with proper console patching
- **Timeout Handling**: Resolved timeout-related crashes and cleanup issues
- **Import Deduplication**: Fixed edge cases in transaction deduplication
- **Console State**: Proper console restoration after API calls
- **Error Messages**: Improved error reporting and debugging information
- **Configuration**: Fixed configuration validation and directory creation
- **Logging**: Resolved logging issues and improved output formatting

### Security
- **Privacy**: Added payee log masking to protect sensitive financial data
- **Error Handling**: Improved error handling to prevent information leakage
- **Dependencies**: Updated dependencies to latest secure versions

### Technical Debt
- **Code Quality**: Comprehensive refactoring and code improvements
- **Testing**: Added full test coverage for critical functionality
- **Documentation**: Extensive documentation improvements
- **CI/CD**: Enhanced automation and quality gates

## Fork Information

This is an enhanced fork of [NikxDa/actual-moneymoney](https://github.com/NikxDa/actual-moneymoney) with significant improvements:

- **80 commits ahead** of upstream
- **5,494+ lines added** with comprehensive enhancements
- **MIT licensed** with dual attribution
- **Independent development** with quarterly upstream sync

### Upstream Sync Policy
- Quarterly syncs with upstream (January, April, July, October)
- Automated sync script: `./scripts/sync-upstream.sh`
- Documentation: `docs/UPSTREAM-SYNC.md`

### Key Improvements Over Upstream
1. **Testing**: From 0 to 11 comprehensive tests
2. **Error Handling**: Robust timeout and error management
3. **Privacy**: Payee data protection and log masking
4. **Configuration**: Advanced TOML configuration options
5. **AI Integration**: Enhanced OpenAI integration with multiple models
6. **Documentation**: Extensive documentation and guides
7. **CI/CD**: Comprehensive automation and quality gates
