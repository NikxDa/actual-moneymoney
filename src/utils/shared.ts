import os from 'os';
import path from 'path';

export const DATE_FORMAT = 'yyyy-MM-dd';

export const APPLICATION_DIRECTORY = path.resolve(os.homedir(), '.actually');

export const DEFAULT_DATA_DIR = path.resolve(
    APPLICATION_DIRECTORY,
    'actual-data'
);

export const DEFAULT_CONFIG_FILE = path.resolve(
    APPLICATION_DIRECTORY,
    'config.toml'
);

export const EXAMPLE_CONFIG = `
# Payee transformation
[payeeTransformation]
enabled = false
openAiApiKey = "<openAiKey>"

# Import settings
[import]
importUncheckedTransactions = true

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
`;
