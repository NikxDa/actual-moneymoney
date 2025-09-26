# Actual-MoneyMoney

![Actual-MoneyMoney Logo](./assets/actual-moneymoney.png)

A CLI to import [MoneyMoney](https://moneymoney-app.com) transactions into [Actual Budget](https://actualbudget.org), written in TypeScript

![GitHub Checks](https://badgers.space/github/checks/NikxDa/actual-moneymoney/main)

## Table of Contents

- [Installation](#installation)
- [Dependencies](#dependencies)
- [Configuration](#configuration)
  - [Basic Configuration](#basic-configuration)
  - [Advanced Configuration](#advanced-configuration)
  - [Payee Transformation](#payee-transformation)
- [Usage](#usage)
- [Account Mapping](#account-mapping)
- [Troubleshooting](#troubleshooting)

## Installation

Install with NPM:

```bash
npm i -g actual-monmon
```

The application will be accessible as a CLI tool with the name `actual-monmon`.

## Dependencies

- Node.js **v20.9.0 or newer** (see `package.json` `engines` field)
- A licensed copy of MoneyMoney on macOS to access the transaction database

**Note on zod version**: This project is currently pinned to zod v3.25.76 due to a peer dependency conflict with the openai package. The openai library requires zod v3.x (`^3.23.8`), but zod v4.x introduces breaking changes that are incompatible. This prevents dependabot from automatically updating to zod v4, which would break the application. We'll update zod when openai releases a version that supports zod v4.

## Configuration

The application needs to be configured with a TOML document to function. By default, Actual-MoneyMoney stores and reads configuration files from `~/.actually/config.toml`.

You can validate (and automatically create) your configuration by running `actual-monmon validate`. If the configuration file does not exist yet, the command will create a starter file at the resolved path (default: `~/.actually/config.toml`). When the file already exists, `validate` leaves it unchanged and only reports schema issues. You can point to a different location with the `--config <path>` option when running any command.

For detailed command-line options, run `actual-monmon --help`.

### Basic Configuration

A basic configuration document looks like this:

```toml
# Payee transformation
[payeeTransformation]
enabled = false
openAiApiKey = "<openAiKey>"  # Your OpenAI API key
openAiModel = "gpt-3.5-turbo"  # Optional: Specify the OpenAI model to use

# Import settings
[import]
importUncheckedTransactions = true
synchronizeClearedStatus = true
maskPayeeNamesInLogs = true  # Optional: keep payee names obfuscated in non-debug logs

# Actual servers, you can add multiple servers
[[actualServers]]
serverUrl = "http://localhost:5006"
serverPassword = "<password>"

# Budgets for the server, you can add multiple budgets
[[actualServers.budgets]]
syncId = "<syncId>" # Get this value from the Actual advanced settings

# E2E encryption for the budget, if enabled
[actualServers.budgets.e2eEncryption]
enabled = false
password = ""

# Account map for the budget
[actualServers.budgets.accountMapping]
# The key is either the account name, or the account number of a MoneyMoney account
# The value is the account name or the account id (from the url) of the Actual account
"<monMonAcc>" = "<actualAcc>"
```

### Advanced Configuration

For advanced configuration options including custom AI prompts, model-specific settings, and comprehensive examples, see the [advanced configuration example](./example-config-advanced.toml) file. This file demonstrates:

- Custom AI prompts for payee transformation
- Model-specific configuration (temperature, max tokens, timeout)
- Multiple server and budget configurations
- E2E encryption settings
- Ignore patterns for transaction filtering
- Privacy controls for payee logging
- Detailed model compatibility information

### Payee Transformation

The payee transformation feature automatically converts payee names to human-readable formats (e.g., "AMAZN S.A.R.L" to "Amazon"). To use this feature:

1. Set `enabled = true` in the `[payeeTransformation]` section
2. Provide a valid OpenAI API key (generate one at [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys))
3. Optionally customize the AI model and settings

#### Custom Prompts

You can override the default AI classification prompt with your own instructions:

```toml
[payeeTransformation]
customPrompt = """
Your custom classification instructions here...
Make sure to instruct the model to return valid JSON.
"""
```

#### Model Configuration

Advanced model settings can be configured:

```toml
[payeeTransformation.modelConfig]
temperature = 0.0  # 0.0 = deterministic, 1.0 = creative (0.0-2.0)
maxTokens = 1000   # Maximum tokens in response
timeout = 30000    # Request timeout in milliseconds
```

**Note**: GPT-4o and GPT-5 models accept temperatures between 0.0 and 2.0. They default to ~0.7 but you can override this for deterministic behavior.

### Configuration Summary

- **Payee transformation**: Automatically standardize payee names using AI
- **Import settings**: Customize import behavior (unchecked transactions, cleared status, payee masking in logs)
- **Actual servers**: Specify which Actual Budget servers to import to
- **Budget configurations**: Define budget files per server with sync IDs
- **E2E encryption**: Handle encrypted budget files
- **Account mapping**: Map MoneyMoney accounts to Actual accounts
- **Ignore patterns**: Filter transactions with case-insensitive `*` wildcards for comments, payees, and purposes

## Usage

### Validation

Before importing, validate your configuration:

```bash
actual-monmon validate
```

You can increase or decrease CLI verbosity with `--logLevel` (`0 = ERROR`, `1 = WARN`, `2 = INFO`, `3 = DEBUG`). Combine it with `--config` to validate a different configuration file:

```bash
actual-monmon validate --config ./config.toml --logLevel 3
```

### Import Transactions

To import transactions:

```bash
actual-monmon import
```

You can limit the scope of an import with additional flags:

- `--server <url>` – import only budgets associated with the specified Actual server URL. Repeat the flag to include multiple servers.
- `--budget <syncId>` – restrict imports to the given Actual budget sync ID. Repeat for multiple budgets.
- `--account <ref>` – import transactions from a specific MoneyMoney account reference.
- `--from YYYY-MM-DD` / `--to YYYY-MM-DD` – bound the transaction date range.
- `--dry-run` – simulate the import without persisting any changes.
- `--logLevel <0-3>` – control CLI verbosity (defaults to `2`, INFO).
- `--config <path>` – load a configuration file from a custom path.

### Command Options

For all available commands and options:

```bash
actual-monmon --help
```

## Account Mapping

Account mapping connects MoneyMoney accounts to Actual Budget accounts:

**MoneyMoney accounts** can be identified by:

1. UUID (via AppleScript API)
2. Account number (IBAN, credit card number, etc.)
3. Account name

**Actual accounts** can be identified by:

1. UUID (from browser URL)
2. Account name

If multiple accounts have the same name, the first match will be used. Invalid mappings or additional accounts are ignored.

## Troubleshooting

### Common Issues

1. **Configuration validation errors**: Run `actual-monmon validate` to see detailed error messages
2. **Import failures**: Check your server URLs, passwords, and sync IDs
3. **Payee transformation not working**: Verify your OpenAI API key and model settings
4. **Account mapping issues**: Ensure account names/IDs match exactly

### Getting Help

- Run `actual-monmon --help` for command-line options
- Use `actual-monmon validate` to check your configuration
- Check the [advanced configuration example](./example-config-advanced.toml) for complex setups
- Review the configuration schema and error messages for specific issues
