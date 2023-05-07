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

type GetTransactionsOptions = {
    from: Date;
    to?: Date;
    forAccount?: string;
    forCategory?: string;
};

class MoneyMoneyApi {
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
