import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LogLevel } from '../../src/utils/Logger.js';
import { runCli } from '../helpers/cli.js';

interface CliTestContext {
    readonly config?: unknown;
}

interface RecordedEvent {
    readonly type: string;
    readonly [key: string]: unknown;
}

const loaderPath = fileURLToPath(
    new URL('../helpers/cli-mock-loader.ts', import.meta.url)
);
const loaderNodeOptions = [
    '--loader',
    'ts-node/esm',
    '--loader',
    loaderPath,
] as const;

const CLI_TIMEOUT_MS = 20000;

const numericLogLevels = Object.values(LogLevel).filter(
    (value): value is number => typeof value === 'number'
);
const expectedInvalidLogLevelMessage = `--logLevel must be a finite number. Values are clamped to ${Math.min(
    ...numericLogLevels
)}-${Math.max(...numericLogLevels)}.`;

const tmpPrefix = path.join(os.tmpdir(), 'actual-monmon-cli-options-');

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
        actualServers: [
            {
                serverUrl: 'https://server.example.com',
                serverPassword: 'secret',
                requestTimeoutMs: 45000,
                budgets: [
                    {
                        syncId: 'budget-1',
                        e2eEncryption: { enabled: false, password: '' },
                        accountMapping: { 'acct-1': 'actual-1' },
                    },
                ],
            },
        ],
    };
}

describe('CLI global options', () => {
    it(
        'clamps log levels above the supported range to DEBUG',
        async () => {
            const { contextDir, eventsFile } = await createContextDir({
                config: createBaseConfig(),
            });

            const result = await runCli(
                ['import', '--dry-run', '--logLevel', '99'],
                {
                    env: {
                        CLI_TEST_CONTEXT_DIR: contextDir,
                        CLI_TEST_EVENTS_FILE: eventsFile,
                        NODE_NO_WARNINGS: '1',
                    },
                    nodeOptions: loaderNodeOptions,
                    timeoutMs: CLI_TIMEOUT_MS,
                }
            );

            expect(result.exitCode).toBe(0);

            const events = await readEvents(eventsFile);
            const loggerEvents = events.filter(
                (event) => event.type === 'Logger#constructor'
            );

            expect(loggerEvents).toEqual([
                {
                    type: 'Logger#constructor',
                    level: 3,
                },
            ]);
        },
        CLI_TIMEOUT_MS
    );

    it(
        'clamps log levels below the supported range to ERROR',
        async () => {
            const { contextDir, eventsFile } = await createContextDir({
                config: createBaseConfig(),
            });

            const result = await runCli(
                ['import', '--dry-run', '--logLevel=-5'],
                {
                    env: {
                        CLI_TEST_CONTEXT_DIR: contextDir,
                        CLI_TEST_EVENTS_FILE: eventsFile,
                        NODE_NO_WARNINGS: '1',
                    },
                    nodeOptions: loaderNodeOptions,
                    timeoutMs: CLI_TIMEOUT_MS,
                }
            );

            expect(result.exitCode).toBe(0);

            const events = await readEvents(eventsFile);
            const loggerEvents = events.filter(
                (event) => event.type === 'Logger#constructor'
            );

            expect(loggerEvents).toEqual([
                {
                    type: 'Logger#constructor',
                    level: 0,
                },
            ]);
        },
        CLI_TIMEOUT_MS
    );

    it(
        'fails with guidance when an invalid log level is provided',
        async () => {
            const { contextDir, eventsFile } = await createContextDir({
                config: createBaseConfig(),
            });

            const result = await runCli(
                ['import', '--dry-run', '--logLevel', 'abc'],
                {
                    env: {
                        CLI_TEST_CONTEXT_DIR: contextDir,
                        CLI_TEST_EVENTS_FILE: eventsFile,
                        NODE_NO_WARNINGS: '1',
                    },
                    nodeOptions: loaderNodeOptions,
                    timeoutMs: CLI_TIMEOUT_MS,
                }
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('');
            expect(result.stderr).toContain(expectedInvalidLogLevelMessage);

            const events = await readEvents(eventsFile);
            const importerEvents = events.filter((event) =>
                event.type.startsWith('Importer#')
            );
            expect(importerEvents).toEqual([]);
        },
        CLI_TIMEOUT_MS
    );

    it(
        'documents the global options in --help output',
        async () => {
            const { contextDir, eventsFile } = await createContextDir({
                config: createBaseConfig(),
            });

            const result = await runCli(['--help'], {
                env: {
                    CLI_TEST_CONTEXT_DIR: contextDir,
                    CLI_TEST_EVENTS_FILE: eventsFile,
                    NODE_NO_WARNINGS: '1',
                },
                nodeOptions: loaderNodeOptions,
                timeoutMs: CLI_TIMEOUT_MS,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe('');
            expect(result.stdout).toMatchInlineSnapshot(`
              "index.js [command]

              Commands:
                index.js import    Import data from MoneyMoney
                index.js validate  View information about and validate the current
                                   configuration

              Options:
                --help      Show help                                                [boolean]
                --version   Show version number                                      [boolean]
                --config    Path to the configuration file                            [string]
                --logLevel  The log level to use (0-3)                                [number]
              "
            `);
        },
        CLI_TIMEOUT_MS
    );
});
