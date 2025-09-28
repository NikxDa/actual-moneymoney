import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../helpers/cli.js';

interface CliTestContext {
    readonly config: unknown;
    readonly importer?: {
        readonly failOnUnknownAccounts?: boolean;
        readonly knownAccounts?: readonly string[];
    };
    readonly accountMap?: unknown;
    readonly moneyMoney?: {
        readonly locked?: boolean;
    };
    readonly configFile?: string;
}

interface RecordedEvent {
    readonly type: string;
    readonly [key: string]: unknown;
}

const loaderPath = fileURLToPath(
    new URL('../helpers/cli-mock-loader.mjs', import.meta.url)
);

const CLI_TIMEOUT_MS = 20000;

const tmpPrefix = path.join(os.tmpdir(), 'actual-monmon-cli-');

const activeTempDirs: string[] = [];

afterEach(async () => {
    while (activeTempDirs.length > 0) {
        const dir = activeTempDirs.pop();
        if (!dir) {
            continue;
        }

        await rm(dir, { recursive: true, force: true });
    }
});

async function createContextDir(context: CliTestContext): Promise<{
    readonly contextDir: string;
    readonly eventsFile: string;
}> {
    const dir = await mkdtemp(tmpPrefix);
    activeTempDirs.push(dir);

    const contextFile = path.join(dir, 'context.json');
    const eventsFile = path.join(dir, 'events.jsonl');

    await writeFile(contextFile, JSON.stringify(context), 'utf8');
    await writeFile(eventsFile, '', 'utf8');

    return { contextDir: dir, eventsFile };
}

async function readEvents(eventsFile: string): Promise<RecordedEvent[]> {
    const content = await readFile(eventsFile, 'utf8');
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as RecordedEvent);
}

function createBaseConfig() {
    return {
        payeeTransformation: {
            enabled: false,
            skipModelValidation: false,
            maskPayeeNamesInLogs: false,
        },
        import: {
            importUncheckedTransactions: true,
            synchronizeClearedStatus: true,
            maskPayeeNamesInLogs: false,
        },
    };
}

describe('import command (CLI)', () => {
    it(
        'executes a dry-run import for the filtered server and budget',
        async () => {
        const config = {
            ...createBaseConfig(),
            actualServers: [
                {
                    serverUrl: 'https://server-a.example.com',
                    serverPassword: 'secret-a',
                    requestTimeoutMs: 45000,
                    budgets: [
                        {
                            syncId: 'budget-a1',
                            e2eEncryption: { enabled: false, password: '' },
                            accountMapping: { 'acct-a1': 'actual-a1' },
                        },
                        {
                            syncId: 'budget-a2',
                            e2eEncryption: { enabled: false, password: '' },
                            accountMapping: { 'acct-a2': 'actual-a2' },
                        },
                    ],
                },
                {
                    serverUrl: 'https://server-b.example.com',
                    serverPassword: 'secret-b',
                    requestTimeoutMs: 45000,
                    budgets: [
                        {
                            syncId: 'budget-b1',
                            e2eEncryption: { enabled: false, password: '' },
                            accountMapping: { 'acct-b1': 'actual-b1' },
                        },
                    ],
                },
            ],
        };

        const { contextDir, eventsFile } = await createContextDir({
            config,
            importer: {
                failOnUnknownAccounts: true,
                knownAccounts: ['acct-a2'],
            },
        });

        const result = await runCli(
            [
                'import',
                '--server',
                'https://server-a.example.com',
                '--budget',
                'budget-a2',
                '--account',
                'acct-a2',
                '--from',
                '2024-01-01',
                '--to',
                '2024-01-31',
                '--dry-run',
            ],
            {
                env: {
                    CLI_TEST_CONTEXT_DIR: contextDir,
                    CLI_TEST_EVENTS_FILE: eventsFile,
                    NODE_NO_WARNINGS: '1',
                },
                nodeOptions: ['--loader', loaderPath],
            }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain(
            'DRY RUN MODE - Importing transactions (no changes will be made)... Budget: budget-a2'
        );

        const events = await readEvents(eventsFile);
        const importerEvents = events.filter(
            (event) => event.type === 'Importer#importTransactions'
        );
        expect(importerEvents).toEqual([
            {
                type: 'Importer#importTransactions',
                budgetSyncId: 'budget-a2',
                options: {
                    accountRefs: ['acct-a2'],
                    from: '2024-01-01T00:00:00.000Z',
                    to: '2024-01-31T00:00:00.000Z',
                    isDryRun: true,
                },
            },
        ]);

        const loadEvents = events.filter(
            (event) => event.type === 'ActualApi#loadBudget'
        );
        expect(loadEvents).toEqual([
            {
                type: 'ActualApi#loadBudget',
                serverUrl: 'https://server-a.example.com',
                budgetSyncId: 'budget-a2',
            },
        ]);
        },
        CLI_TIMEOUT_MS
    );

    it(
        'imports all budgets for the selected server when dry-run is disabled',
        async () => {
        const config = {
            ...createBaseConfig(),
            actualServers: [
                {
                    serverUrl: 'https://server-only.example.com',
                    serverPassword: 'secret-main',
                    requestTimeoutMs: 45000,
                    budgets: [
                        {
                            syncId: 'primary-budget',
                            e2eEncryption: { enabled: false, password: '' },
                            accountMapping: { primary: 'actual-primary' },
                        },
                        {
                            syncId: 'secondary-budget',
                            e2eEncryption: { enabled: false, password: '' },
                            accountMapping: { secondary: 'actual-secondary' },
                        },
                    ],
                },
            ],
        };

        const { contextDir, eventsFile } = await createContextDir({
            config,
        });

        const result = await runCli(
            ['import', '--server', 'https://server-only.example.com'],
            {
                env: {
                    CLI_TEST_CONTEXT_DIR: contextDir,
                    CLI_TEST_EVENTS_FILE: eventsFile,
                    NODE_NO_WARNINGS: '1',
                },
                nodeOptions: ['--loader', loaderPath],
            }
        );

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('Importing transactions... Budget: primary-budget');
        expect(result.stdout).toContain('Importing transactions... Budget: secondary-budget');

        const events = await readEvents(eventsFile);
        const importerEvents = events
            .filter((event) => event.type === 'Importer#importTransactions')
            .map((event) => event.options);

        expect(importerEvents).toEqual([
            {
                accountRefs: null,
                from: null,
                to: null,
                isDryRun: false,
            },
            {
                accountRefs: null,
                from: null,
                to: null,
                isDryRun: false,
            },
        ]);
        },
        CLI_TIMEOUT_MS
    );

    it(
        'fails with a helpful error when account filters are unknown',
        async () => {
        const config = {
            ...createBaseConfig(),
            actualServers: [
                {
                    serverUrl: 'https://server-only.example.com',
                    serverPassword: 'secret-main',
                    requestTimeoutMs: 45000,
                    budgets: [
                        {
                            syncId: 'primary-budget',
                            e2eEncryption: { enabled: false, password: '' },
                            accountMapping: { primary: 'actual-primary' },
                        },
                    ],
                },
            ],
        };

        const { contextDir, eventsFile } = await createContextDir({
            config,
            importer: {
                failOnUnknownAccounts: true,
                knownAccounts: ['primary'],
            },
        });

        const result = await runCli(
            ['import', '--account', 'unknown-account'],
            {
                env: {
                    CLI_TEST_CONTEXT_DIR: contextDir,
                    CLI_TEST_EVENTS_FILE: eventsFile,
                    NODE_NO_WARNINGS: '1',
                },
                nodeOptions: ['--loader', loaderPath],
            }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Unknown account reference: unknown-account');

        const events = await readEvents(eventsFile);
        const shutdownEvents = events.filter(
            (event) => event.type === 'ActualApi#shutdown'
        );
        expect(shutdownEvents).toEqual([
            {
                type: 'ActualApi#shutdown',
                serverUrl: 'https://server-only.example.com',
            },
        ]);

        const importerEvents = events.filter(
            (event) => event.type === 'Importer#importTransactions'
        );
        expect(importerEvents).toHaveLength(1);
        expect(importerEvents[0]).toMatchObject({
            error: 'Unknown account reference: unknown-account',
        });
        },
        CLI_TIMEOUT_MS
    );
});
