import plist from 'plist';
import { runAppleScript } from 'run-applescript';

/*
    accountNumber: '<AccNo>',
    attributes: {},
    balance: [ [Array] ],
    bankCode: '<BIC>',
    currency: 'EUR',
    group: false,
    icon: ...,
    indentation: 1,
    name: '<Name>',
    owner: '<OwnerName>',
    portfolio: false,
    uuid: '<uuid>'
 */

type MonMonBalanceEntry = [number, string];

export type MonMonAccount = {
    accountNumber: string;
    attributes: any;
    balance: MonMonBalanceEntry[];
    bankCode: string;
    currency: string;
    group: boolean;
    icon: Buffer;
    indentation: number;
    name: string;
    owner: string;
    portfolio: boolean;
    uuid: string;
};

/*
    accountNumber: '<AccNo>',
    accountUuid: '<AccUUID>',
    amount: -11.33,
    bankCode: '<BIC>>',
    booked: false,
    bookingDate: 2023-05-05T12:00:00.000Z,
    bookingText: 'Lastschrift',
    categoryUuid: 'a2fea395-d50a-41f9-913a-4a73dec89e72',
    checkmark: false,
    creditorId: '<CreditorId>>',
    currency: 'EUR',
    id: 3621,
    mandateReference: '<MandateRef>>',
    name: '<Name>',
    purpose: '<Purpose>',
    valueDate: 2023-05-05T12:00:00.000Z
 */

export type MonMonTransaction = {
    accountNumber: string;
    accountUuid: string;
    amount: number;
    bankCode: string;
    booked: boolean;
    bookingDate: Date;
    bookingText: string;
    categoryUuid: string;
    checkmark: boolean;
    creditorId: string;
    currency: string;
    id: number;
    mandateReference: string;
    name: string;
    purpose: string;
    valueDate: Date;
};

/*
    budget: { amount: 0, available: 0, period: 'monthly' },
    currency: 'EUR',
    default: false,
    group: false,
    icon: <Buffer 89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52 00 00 00 20 00 00 00 20 10 06 00 00 00 23 ea a6 b7 00 00 0c 40 69 43 43 50 49 43 43 20 50 72 6f 66 69 ... 4101 more bytes>,
    indentation: 0,
    name: 'Shopping',
    rules: '"Amazon"',
    uuid: 'dc6992b5-5b69-4224-a23e-7b9a400275ac'
    */

type MonMonCategoryDefault =
    | {
          default: true;
          budget: {};
      }
    | {
          default: false;
          budget: {
              amount: number;
              available: number;
              period: 'monthly' | 'yearly' | 'qurterly' | 'total';
          };
      };

export type MonMonCategory = MonMonCategoryDefault & {
    currency: string;
    group: boolean;
    icon: Buffer;
    indentation: number;
    name: string;
    rules: string;
    uuid: string;
};

type GetTransactionsOptions = {
    from: Date;
    to?: Date;
    forAccount?: string;
    forCategory?: string;
};

class MoneyMoneyApi {
    async getCategories() {
        if (await this.isDatabaseLocked()) {
            return [];
        }

        const script = `
            tell application "MoneyMoney"
                export categories
            end tell
        `;

        const result = await runAppleScript(script);
        const categories = plist.parse(result);

        return categories as MonMonCategory[];
    }

    async getAccounts() {
        if (await this.isDatabaseLocked()) {
            return [];
        }

        const script = `
            tell application "MoneyMoney"
                export accounts
            end tell
        `;

        const result = await runAppleScript(script);
        const accounts = plist.parse(result);

        return accounts as MonMonAccount[];
    }

    async getTransactions({
        to,
        from,
        forAccount,
        forCategory,
    }: GetTransactionsOptions) {
        if (await this.isDatabaseLocked()) {
            return [];
        }

        let exportParameters = '';

        if (forAccount) {
            exportParameters += ` for account "${forAccount}"`;
        }

        if (forCategory) {
            exportParameters += ` for category "${forCategory}"`;
        }

        if (to) {
            const formattedToDate = to.toISOString().split('T')[0];
            exportParameters += ` to date "${formattedToDate}"`;
        }

        const formattedFromDate = from.toISOString().split('T')[0];
        exportParameters += ` from date "${formattedFromDate}" as "plist"`;

        const script = `
            tell application "MoneyMoney"
                export transactions${exportParameters}
            end tell
        `;

        const result = await runAppleScript(script);
        const data = plist.parse(result);

        return (data as any).transactions as MonMonTransaction[];
    }

    async isDatabaseLocked() {
        const nextYear = new Date().getFullYear() + 1;

        const script = `
            tell application "MoneyMoney"
                export transactions from date "${nextYear}-01-01" as "plist"
            end tell
        `;

        try {
            await runAppleScript(script);
            return false;
        } catch (error) {
            return true;
        }
    }
}

export default MoneyMoneyApi;
