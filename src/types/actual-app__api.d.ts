/**
 * Actual object
 * {
  internal: {
    getDataDir: [Function: getDataDir],
    sendMessage: [Function: sendMessage],
    send: [Function: send],
    on: [Function: on],
    syncAndReceiveMessages: [Function: syncAndReceiveMessages],
    q: [Function: q],
    db: Object [Module] {
      getDatabasePath: [Getter],
      openDatabase: [Getter],
      reopenDatabase: [Getter],
      closeDatabase: [Getter],
      setDatabase: [Getter],
      getDatabase: [Getter],
      loadClock: [Getter],
      runQuery: [Getter],
      execQuery: [Getter],
      cache: [Getter],
      transaction: [Getter],
      asyncTransaction: [Getter],
      all: [Getter],
      first: [Getter],
      firstSync: [Getter],
      run: [Getter],
      select: [Getter],
      update: [Getter],
      insertWithUUID: [Getter],
      insert: [Getter],
      delete_: [Getter],
      selectWithSchema: [Getter],
      selectFirstWithSchema: [Getter],
      insertWithSchema: [Getter],
      updateWithSchema: [Getter],
      getCategories: [Getter],
      getCategoriesGrouped: [Getter],
      insertCategoryGroup: [Getter],
      updateCategoryGroup: [Getter],
      moveCategoryGroup: [Getter],
      deleteCategoryGroup: [Getter],
      insertCategory: [Getter],
      updateCategory: [Getter],
      moveCategory: [Getter],
      deleteCategory: [Getter],
      getPayee: [Getter],
      insertPayee: [Getter],
      deletePayee: [Getter],
      deleteTransferPayee: [Getter],
      updatePayee: [Getter],
      mergePayees: [Getter],
      getPayees: [Getter],
      getOrphanedPayees: [Getter],
      getPayeeByName: [Getter],
      getAccounts: [Getter],
      insertAccount: [Getter],
      updateAccount: [Getter],
      deleteAccount: [Getter],
      moveAccount: [Getter],
      getTransaction: [Getter],
      getTransactionsByDate: [Getter],
      getTransactions: [Getter],
      insertTransaction: [Getter],
      updateTransaction: [Getter],
      deleteTransaction: [Getter],
      toDateRepr: [Getter],
      fromDateRepr: [Getter]
    },
    merkle: Object [Module] {
      getKeys: [Getter],
      keyToTimestamp: [Getter],
      insert: [Getter],
      build: [Getter],
      diff: [Getter],
      prune: [Getter],
      debug: [Getter]
    },
    timestamp: {
      getClock: [Function: getClock],
      setClock: [Function: setClock],
      makeClock: [Function: makeClock],
      makeClientId: [Function: makeClientId],
      serializeClock: [Function: serializeClock],
      deserializeClock: [Function: deserializeClock],
      Timestamp: [Function]
    },
    SyncProtoBuf: {
      EncryptedData: [Function],
      Message: [Function],
      MessageEnvelope: [Function],
      SyncRequest: [Function],
      SyncResponse: [Function]
    }
  },
  methods: {
    q: [Getter],
    runImport: [Function: runImport],
    loadBudget: [Function: loadBudget],
    downloadBudget: [Function: downloadBudget],
    batchBudgetUpdates: [Function: batchBudgetUpdates],
    runQuery: [Function: runQuery],
    getBudgetMonths: [Function: getBudgetMonths],
    getBudgetMonth: [Function: getBudgetMonth],
    setBudgetAmount: [Function: setBudgetAmount],
    setBudgetCarryover: [Function: setBudgetCarryover],
    addTransactions: [Function: addTransactions],
    importTransactions: [Function: importTransactions],
    getTransactions: [Function: getTransactions],
    filterTransactions: [Function: filterTransactions],
    updateTransaction: [Function: updateTransaction],
    deleteTransaction: [Function: deleteTransaction],
    getAccounts: [Function: getAccounts],
    createAccount: [Function: createAccount],
    updateAccount: [Function: updateAccount],
    closeAccount: [Function: closeAccount],
    reopenAccount: [Function: reopenAccount],
    deleteAccount: [Function: deleteAccount],
    createCategoryGroup: [Function: createCategoryGroup],
    updateCategoryGroup: [Function: updateCategoryGroup],
    deleteCategoryGroup: [Function: deleteCategoryGroup],
    getCategories: [Function: getCategories],
    createCategory: [Function: createCategory],
    updateCategory: [Function: updateCategory],
    deleteCategory: [Function: deleteCategory],
    getPayees: [Function: getPayees],
    createPayee: [Function: createPayee],
    updatePayee: [Function: updatePayee],
    deletePayee: [Function: deletePayee]
  },
  utils: {
    amountToInteger: [Function: amountToInteger],
    integerToAmount: [Function: integerToAmount]
  },
  init: [Function: init],
  shutdown: [Function: shutdown]
}
 */

declare module '@actual-app/api' {
    export function doSomething(param1: string, param2: number): void;
    export function doSomethingElse(param1: number): string;

    type InitParams = {
        // Budget data will be cached locally here, in subdirectories for each file.
        dataDir: string;
        // This is the URL of your running server
        serverURL: string;
        // This is the password you use to log into the server
        password?: string;
    };

    type InitResult = {};

    export async function init(
        params: InitParams
    ): Promise<undefined | InitResult>;
    export async function shutdown(): Promise<void>;

    export const internal: {
        send: (message: string) => Promise<void>;
    };

    export const methods: {
        // Budget
        downloadBudget: (
            budgetId: ID,
            options?: {
                password?: string;
            }
        ) => Promise<void>;

        // Transactions
        addTransactions: (
            accountId: ID,
            transactions: CreateTransaction[]
        ) => Promise<ID[]>;
        importTransactions: (
            accountId: ID,
            transactions: CreateTransaction[]
        ) => Promise<{ errors: Error[]; added: ID[]; updated: ID[] }>;
        getTransactions: (
            accountId: ID,
            startDate: DateString,
            endDate: DateString
        ) => Promise<ReadTransaction[]>;
        updateTransaction: (
            transactionId: ID,
            fields: UpdateFields<UpdateTransaction>
        ) => Promise<ID>;
        deleteTransaction: (transactionId: ID) => Promise<void>;

        // Accounts
        getAccounts: () => Promise<Account[]>;
        createAccount: (
            account: CreateAccount,
            initialBalance?: number
        ) => Promise<ID>;
        updateAccount: (accountId: ID, fields: UpdateAccount) => Promise<ID>;
        deleteAccount: (accountId: ID) => Promise<void>;
        closeAccount: (
            accountId: ID,
            transferAccountId?: ID,
            transferCategoryId?: ID
        ) => Promise<void>;
        reopenAccount: (accountId: ID) => Promise<void>;

        // Categories
        getCategories: () => Promise<Category[]>;
        createCategory: (category: Category) => Promise<ID>;
        updateCategory: (
            categoryId: ID,
            fields: UpdateFields<Category>
        ) => Promise<ID>;
        deleteCategory: (categoryId: ID) => Promise<void>;

        // Category groups
        getCategoryGroups: () => Promise<CategoryGroup[]>;
        createCategoryGroup: (
            categoryGroup: CategoryGroupPayload
        ) => Promise<ID>;
        updateCategoryGroup: (
            categoryGroupId: ID,
            fields: UpdateFields<CategoryGroupPayload>
        ) => Promise<ID>;
        deleteCategoryGroup: (categoryGroupId: ID) => Promise<void>;
    };
}

type UpdateFields<T> = Partial<Omit<T, 'id'>>;

type BaseSubTransaction = {
    amount: Amount;
    category_id: ID;
    notes: string;
};

type ReadSubTransaction = Pick<BaseSubTransaction, 'amount'> &
    Partial<Pick<BaseSubTransaction, 'category_id' | 'notes'>>;
type CreateSubTransaction = Pick<BaseSubTransaction, 'amount'> &
    Partial<Pick<BaseSubTransaction, 'category_id' | 'notes'>>;

type BaseTransaction = {
    id: ID;
    account: ID;
    date: DateString;
    amount: Amount;
    payee: ID;
    payee_name: string;
    imported_payee: string;
    category: ID;
    notes: string;
    imported_id: string;
    transfer_id: string;
    cleared: boolean;
};

type ReadTransaction = Omit<BaseTransaction, 'payee_name'> & {
    subtransactions: ReadSubTransaction[];
};

type CreateTransaction = Modify<
    BaseTransaction,
    | 'amount'
    | 'payee'
    | 'payee_name'
    | 'imported_payee'
    | 'category'
    | 'notes'
    | 'imported_id'
    | 'transfer_id'
    | 'cleared',
    'id' | 'account'
>;

type AccountType =
    | 'checking'
    | 'savings'
    | 'credit'
    | 'investment'
    | 'mortgage'
    | 'debt'
    | 'other';

type Account = {
    id: ID;
    name: string;
    type: AccountType;
    offbudget: boolean;
    closed: boolean;
};

type ReadAccount = Account;
type CreateAccount = Modify<Account, 'offbudget' | 'closed', 'id'>;
type UpdateAccount = Modify<Account, void, 'id'>;

/*
getAccounts
getAccounts() → Promise<Account[]>

Get all accounts. Returns an array of Account objects.

createAccount
createAccount(Accountaccount, amount?initialBalance = 0) → Promise<id>

Create an account with an initial balance of initialBalance (defaults to 0). Remember that amount has no decimal places. Returns the id of the new account.

updateAccount
updateAccount(idid, objectfields) → Promise<null>

Update fields of an account. fields can specify any field described in Account.

closeAccount
closeAccount(idid, id?transferAccountId, id?transferCategoryId) → Promise<null>

Close an account. transferAccountId and transferCategoryId are optional if the balance of the account is 0, otherwise see next paragraph.

If the account has a non-zero balance, you need to specify an account with transferAccountId to transfer the money into. If you are transferring from an on-budget account to an off-budget account, you can optionally specify a category with transferCategoryId to categorize the transfer transaction.

Tranferring money to an off-budget account needs a category because money is taken out of the budget, so it needs to come from somewhere.

If you want to simply delete an account, see deleteAccount.

reopenAccount
reopenAccount(idid) → Promise<null>

Reopen a closed account.

deleteAccount
deleteAccount(idid) → Promise<null>

Delete an account.
*/

type CreateTransaction = Pick<BaseTransaction, 'account' | 'date'> &
    Partial<Omit<BaseTransaction, 'id' | 'account' | 'date'>> & {
        subtransactions: CreateSubTransaction[];
    };

type UpdateTransaction = Omit<BaseTransaction, 'id' | 'subtransactions'>;

type Category = {
    id: ID;
    name: string;
    group_id: ID;
    is_income: boolean;
};

type CategoryGroupPayload = Omit<CategoryGroup, 'categories'>;

type CategoryGroup = {
    id: ID;
    name: string;
    is_income: boolean;
    categories: Category[];
};

type Modify<T, OptionalKeys extends keyof T, RemoveKeys extends keyof T> = Omit<
    T,
    RemoveKeys | OptionalKeys
> &
    Partial<Pick<T, OptionalKeys>>;

type ID = string;
type MonthString = string;
type DateString = string;
type Amount = number;
