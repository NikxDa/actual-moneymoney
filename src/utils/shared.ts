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
openAiModel = "gpt-3.5-turbo"
# maskPayeeNamesInLogs = true
# skipModelValidation = false # Optional: Skip contacting OpenAI to verify the model name
# customPrompt = "Your custom prompt here..." # Optional: Override default prompt
# [payeeTransformation.modelConfig] # Optional: Model-specific settings
# temperature = 0.0 # 0.0 = deterministic, 1.0 = creative (0.0-2.0)
# maxTokens = 1000 # Maximum tokens in response
# timeout = 30000 # Request timeout in milliseconds

# Import settings
[import]
importUncheckedTransactions = true
# maskPayeeNamesInLogs = true # Optional: replace payee names in import logs with deterministic placeholders

# Actual servers, you can add multiple servers
[[actualServers]]
serverUrl = "http://localhost:5006"
serverPassword = "<password>"
# requestTimeoutMs = 45000 # Optional: Override the Actual server request timeout (ms, max 300000)

# Budgets for the server, you can add multiple budgets
[[actualServers.budgets]]
syncId = "<syncId>" # Get this value from the Actual advanced settings
# earliestImportDate = "2021-01-01" # Optional, only import transactions from this date

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
