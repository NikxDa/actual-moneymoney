# Actual-MoneyMoney

![Actual-MoneyMoney Logo](./assets/actual-moneymoney.png)

A CLI to import [MoneyMoney](https://moneymoney-app.com) transactions into [Actual Budget](https://actualbudget.org), written in TypeScript

![GitHub Checks](https://badgers.space/github/checks/NikxDa/actual-moneymoney/main)

## Installation

Install with NPM:

```bash
npm i -g actual-moneymoney
```

The application will be accessible as a CLI tool with the name `actual-monmon`.

## Dependencies

**Note on zod version**: This project is currently pinned to zod v3.25.76 due to a peer dependency conflict with the openai package. The openai library requires zod v3.x (`^3.23.8`), but zod v4.x introduces breaking changes that are incompatible. This prevents dependabot from automatically updating to zod v4, which would break the application. We'll update zod when openai releases a version that supports zod v4.

## Configuration

Details on parameters are available by running `actual-monmon --help`.

The application needs to be configured with a TOML document in order to function. You can validate the configuration details by running `actual-monmon validate`. Running this for the first time will create an example configuration and print the path. You can pass a custom configuration with the `--config` parameter.

A configuration document looks like this:

```toml
# Payee transformation
[payeeTransformation]
enabled = false
openAiApiKey = "<openAiKey>"  # Your OpenAI API key
openAiModel = "gpt-3.5-turbo"  # Optional: Specify the OpenAI model to use (default: gpt-3.5-turbo)
# customPrompt = "Your custom prompt here..." # Optional: Override default prompt
# [payeeTransformation.modelConfig] # Optional: Model-specific settings
# temperature = 0.0 # 0.0 = deterministic, 1.0 = creative (0.0-2.0)
# maxTokens = 1000 # Maximum tokens in response
# timeout = 30000 # Request timeout in milliseconds

# Import settings
[import]
importUncheckedTransactions = true
synchronizeClearedStatus = true

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

A short summary:

- **Payee transformation** allows the automatic conversion of payee names to human-readable formats, e.g. "AMAZN S.A.R.L" to "Amazon". In order for this to function, you also need to provide a valid OpenAI API key. You can generate this key at [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- **Import settings** allow you to customize the import behavior, e.g. whether unchecked transactions should be imported.
- **Actual servers** specify which servers should be imported to
- **Budget configurations** describe the budget files per server which are import targets. The sync ID can be grabbed from the Actual web interface by navigating to settings, then advanced settings. If the budget file is end-to-end encrypted, the details need to be provided here.
- **Account mapping** maps each MoneyMoney account to an Actual account. MoneyMoney accounts can be described by their UUID (accessible via the AppleScript API of MoneyMoney only, at this time), account number (IBAN, credit card no, etc.) or their name (in this order). Actual accounts can be described by their UUID (can be copied from the URL in a browser window) or their name (in that order). If a name occurs multiple times, the first one will be used. Invalid mappings or additional accounts are ignored.

Once you have configured your importer, run `actual-monmon validate` again to verify that the configuration has the correct format.

### Advanced Payee Transformation Features

#### Custom Prompts

You can override the default AI classification prompt with your own instructions:

```toml
[payeeTransformation]
customPrompt = """
Your custom classification instructions here...
Make sure to instruct the model to return valid JSON.
"""
```
