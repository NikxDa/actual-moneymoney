# Actual-MoneyMoney

> A CLI to import [MoneyMoney](https://moneymoney-app.com) transactions into [Actual Budget](https://actualbudget.org), written in TypeScript

## Installation

Currently, this tool is not available via a package registry. To use it, clone this repository, then build it yourself by running

```bash
$ cd /path/to/cloned/repo
$ npm run build # Build 
$ node dist/index.js --help # Show CLI help
```

Since this application requires MoneyMoney to be present and running, it only works on macOS. MoneyMoney needs to be unlocked for the application to work.

## Usage

First, make sure your Actual instance is running and reachable. For the sake of this example, we will assume that Actual is running on `https://localhost:5006`.

Run the setup script by entering

```bash
$ node dist/index.js setup
```

The CLI will guide you through a couple of questions, like where your instance is running. Enter the details accordingly. Please note: E2E-encrypted instances are currently not supported!

After having set up the connection, you can import transactions from MoneyMoney:

```bash
$ node dist/index.js import
```

The application will keep track of transactions that it has previously imported, so running the same import command twice will not result in duplicates. When you first run the import script, the tool will ask you to map the existing MoneyMoney accounts to accounts in Actual. You can pick the corresponding account, or create a new account in Actual if desired.

After the account mapping is set up, the tool will read all transactions from MoneyMoney since the date given via the `--from` parameter (in format `yyyy-MM-dd`), and import them to the mapped account. If `--from` is omitted, it will search for transactions that are no older than 1 month. If accounts have no transactions, or you are creating a new Actual account, the application will also create starting balances.

Please note: There is currently no way to choose the exact transaction to start the import at. Either all transactions from a given date will be imported, or none. In order to avoid duplicates when running the import for the first time, please make sure to specify a start date of which no transactions currently exist in Actual.

For more parameters and options, use the `--help` to get help.

