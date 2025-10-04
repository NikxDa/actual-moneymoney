<p align="center">
    <img src="./assets/actual-moneymoney.png" height="150">
</p>
<h1 align="center">Actual-MoneyMoney</h1>
<p align="center">
A CLI to import <a href="https://moneymoney-app.com" target="_blanK">MoneyMoney</a> transactions into <a href="https://actualbudget.org">Actual Budget</a>, written in TypeScript
<p>
<p align="center">
<img src="https://badgers.space/github/checks/NikxDa/actual-moneymoney/main">
</p>

## Installation

Install with NPM:

```bash
$ npm i -g actual-moneymoney
```

The application will be accessible as a CLI tool with the name `actual-monmon`.

## Configuration

Details on parameters are available by running `actual-monmon --help`.

The application needs to be configured with a TOML document in order to function. You can validate the configuration details by running `actual-monmon validate`. Running this for the first time will create an example configuration and print the path. You can pass a custom configuration with the `--config` parameter.

A configuration document looks like this:

```
# Payee transformation
[payeeTransformation]
enabled = false
openAiApiKey = "<openAiKey>"  # Your OpenAI API key
openAiModel = "gpt-3.5-turbo"  # Optional: Specify the OpenAI model to use (default: gpt-3.5-turbo)
prompt = "<custom prompt>"  # Optional: Override the default payee transformation instructions

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

-   **Payee transformation** allows the automatic conversion of payee names to human-readable formats, e.g. "AMAZN S.A.R.L" to "Amazon". In order for this to function, you also need to provide a valid OpenAI API key. You can generate this key at [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys). You can optionally override the default prompt with custom instructions if you need different transformation rules.
-   **Import settings** allow you to customize the import behavior, e.g. whether unchecked transactions should be imported.
-   **Actual servers** specify which servers should be imported to
-   **Budget configurations** describe the budget files per server which are import targets. The sync ID can be grabbed from the Actual web interface by navigating to settings, then advanced settings. If the budget file is end-to-end encrypted, the details need to be provided here.
-   **Account mapping** maps each MoneyMoney account to an Actual account. MoneyMoney accounts can be described by their UUID (accessible via the AppleScript API of MoneyMoney only, at this time), account number (IBAN, credit card no, etc.) or their name (in this order). Actual accounts can be described by their UUID (can be copied from the URL in a browser window) or their name (in that order). If a name occurs multiple times, the first one will be used. Invalid mappings or additional accounts are ignored.

Once you have configured your importer, run `actual-monmon validate` again to verify that the configuration has the correct format.

## Usage

Once configured, importing is as simple as running `actual-monmon import`. Make sure that the Actual servers are running and that MoneyMoney is unlocked. By default, the importer will import 1 month worth of transactions. You can override this by passing the `--from` property, like so: `actual-monmon import --from=2024-01-01`. Similarly, a `--to` property is available in case you want to import a specific date range.

The importer will not track previous imports, so if you wait more than one month between imports, you might need to manually specify the last import date. Running the importer twice in the same month is no problem, as duplicate transactions will automatically be detected and skipped.

You can scope imports with the `--server`, `--budget`, and `--account` options on the import command. Each flag is case-insensitive, can be repeated, and accepts comma-separated values. If no filters are provided, everything is imported (the previous default behaviour).

Examples:

```bash
# Import only these accounts
actual-monmon import -a "DKB Giro" -a "DKB Visa"
actual-monmon import -a "DKB Giro,DKB Visa"

# Restrict to a specific server
actual-monmon import -s myServerA

# Restrict to a server and budget
actual-monmon import -s myServerA -b HomeBudget

# Apply all filters at once
actual-monmon import -s myServerA -b HomeBudget -a "Groceries,Utilities"
```

## Advanced Configuration

The following configuration options can optionally be added

### Ignore patterns

Ignore patterns allow you to specify payee names, comments, or purposes which should be ignored. _Note:_ Currently, the strings are treated as is, meaning they are case-sensitive, and will be checked for inclusion, not exact matches.

```
[import.ignorePatterns]
commentPatterns = ["[actual-ignore]"]
payeePatterns = []
purposePatterns = []
```

The above configuration would ignore all transactions that have a comment containing the string `[actual-ignore]`.

### Earliest import date

Each budget can specify an earliest import date. This can be useful when starting to use the importer with an already existing budget in order to prevent duplicates from being imported. The importer will ignore any transactions from before the specified date.

```
[[actualServers.budgets]]
earliestImportDate = "2024-01-01" # Format is YYYY-MM-DD
```

Note that the date is a string, not a TOML date.

## Bugs

If you notice any bugs or issues, please file an issue.
