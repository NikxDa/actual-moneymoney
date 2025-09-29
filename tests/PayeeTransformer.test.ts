import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

import type Logger from '../src/utils/Logger.js';
import { LogLevel } from '../src/utils/Logger.js';

const listMock = vi.fn();
const createMock = vi.fn();

class MockOpenAI {
    public models = {
        list: listMock,
    };

    public chat = {
        completions: {
            create: createMock,
        },
    };

    constructor(public readonly options: { apiKey: string; timeout?: number }) {}
}

vi.mock('openai', () => ({
    default: MockOpenAI,
}));

let dataDir: string;

vi.mock('../src/utils/shared.js', async () => {
    const actual = await vi.importActual<typeof import('../src/utils/shared.js')>('../src/utils/shared.js');

    return {
        ...actual,
        get DEFAULT_DATA_DIR() {
            return dataDir;
        },
    };
});

const createLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLevel: () => LogLevel.DEBUG,
    }) as unknown as Logger;

const importTransformer = async () => {
    const module = await import('../src/utils/PayeeTransformer.js');
    return module.default;
};

beforeEach(async () => {
    listMock.mockReset();
    createMock.mockReset();

    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'actual-moneymoney-test-'));

    createMock.mockImplementation(async (config: { messages: Array<{ role?: string; content: string }> }) => {
        const userMessage =
            [...config.messages].reverse().find((m) => (m as { role?: string }).role === 'user')?.content ??
            config.messages.at(-1)?.content ??
            '';
        const payees = userMessage.split('\n').filter(Boolean);
        const result = Object.fromEntries(payees.map((payee) => [payee, `${payee}-normalized`]));

        return {
            choices: [
                {
                    message: {
                        content: JSON.stringify(result),
                    },
                },
            ],
        };
    });

    listMock.mockResolvedValue({
        data: [{ id: 'gpt-3.5-turbo' }, { id: 'gpt-4o-mini' }],
    });
});

afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    // Reset module state between tests to clear static caches
    vi.resetModules();
});

describe('PayeeTransformer', () => {
    it('skips model validation when configured', async () => {
        const PayeeTransformer = await importTransformer();
        const transformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'custom-model',
                skipModelValidation: true,
                maskPayeeNamesInLogs: false,
            },
            createLogger()
        );

        const result = await transformer.transformPayees(['Example Vendor']);

        expect(result).toEqual({
            'Example Vendor': 'Example Vendor-normalized',
        });
        expect(listMock).not.toHaveBeenCalled();
        expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('caches model list between transformer instances', async () => {
        const PayeeTransformer = await importTransformer();

        const firstTransformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            createLogger()
        );

        await firstTransformer.transformPayees(['Vendor A']);

        const secondTransformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            createLogger()
        );

        await secondTransformer.transformPayees(['Vendor B']);

        expect(listMock).toHaveBeenCalledTimes(1);
    });

    it('memoizes transformed payees within the same run', async () => {
        const PayeeTransformer = await importTransformer();

        const transformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            createLogger()
        );

        await transformer.transformPayees(['Vendor C']);
        listMock.mockClear();
        createMock.mockClear();

        const result = await transformer.transformPayees(['Vendor C']);

        expect(result).toEqual({ 'Vendor C': 'Vendor C-normalized' });
        expect(createMock).not.toHaveBeenCalled();
    });

    it('uses disk cache when available without hitting the API', async () => {
        const cacheFile = path.join(dataDir, 'openai-model-cache.json');
        const cachedModels = {
            models: ['cached-model-a', 'cached-model-b'],
            expiresAt: Date.now() + 60 * 60 * 1000,
        };

        await fs.writeFile(cacheFile, JSON.stringify(cachedModels), 'utf-8');

        await vi.resetModules();

        vi.doMock('openai', () => ({
            default: MockOpenAI,
        }));

        vi.doMock('../src/utils/shared.js', async () => {
            const actual = await vi.importActual<typeof import('../src/utils/shared.js')>('../src/utils/shared.js');

            return {
                ...actual,
                get DEFAULT_DATA_DIR() {
                    return dataDir;
                },
            };
        });

        listMock.mockClear();
        createMock.mockClear();

        const PayeeTransformer = await importTransformer();
        const transformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'cached-model-a',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            createLogger()
        );

        await transformer.transformPayees(['Vendor Disk']);

        expect(listMock).not.toHaveBeenCalled();
        expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('heals corrupted disk cache entries automatically', async () => {
        const cacheFile = path.join(dataDir, 'openai-model-cache.json');
        await fs.writeFile(cacheFile, '{ invalid json', 'utf-8');

        const PayeeTransformer = await importTransformer();
        const logger = createLogger();
        const transformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            logger
        );

        const result = await transformer.transformPayees(['Vendor Corrupted Cache']);

        expect(result).toEqual({
            'Vendor Corrupted Cache': 'Vendor Corrupted Cache-normalized',
        });

        expect(logger.warn).toHaveBeenCalledWith(
            'OpenAI model cache was corrupted and has been reset.',
            expect.arrayContaining([
                expect.stringContaining(`Path: ${cacheFile}`),
                expect.stringContaining('Parse error:'),
            ])
        );

        const healedContent = await fs.readFile(cacheFile, 'utf-8');
        expect(() => JSON.parse(healedContent)).not.toThrow();
        const healedCache = JSON.parse(healedContent) as {
            models: string[];
            expiresAt: number;
        };

        expect(healedCache.models).toEqual(['gpt-3.5-turbo', 'gpt-4o-mini']);
        expect(typeof healedCache.expiresAt).toBe('number');

        listMock.mockClear();
        createMock.mockClear();

        await vi.resetModules();

        vi.doMock('openai', () => ({
            default: MockOpenAI,
        }));

        vi.doMock('../src/utils/shared.js', async () => {
            const actual = await vi.importActual<typeof import('../src/utils/shared.js')>('../src/utils/shared.js');

            return {
                ...actual,
                get DEFAULT_DATA_DIR() {
                    return dataDir;
                },
            };
        });

        const ReloadedPayeeTransformer = await importTransformer();
        const secondLogger = createLogger();
        const secondTransformer = new ReloadedPayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            secondLogger
        );

        const secondResult = await secondTransformer.transformPayees(['Vendor Healthy Cache']);

        expect(secondResult).toEqual({
            'Vendor Healthy Cache': 'Vendor Healthy Cache-normalized',
        });
        expect(secondLogger.warn).not.toHaveBeenCalled();
        expect(listMock).not.toHaveBeenCalled();
    });

    it('handles empty OpenAI payload by falling back to original payee names', async () => {
        const PayeeTransformer = await importTransformer();
        const logger = createLogger();
        const transformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            logger
        );

        // Mock OpenAI to return empty payload
        createMock.mockImplementation(async () => ({
            choices: [
                {
                    message: {
                        content: JSON.stringify({}),
                    },
                },
            ],
        }));

        const result = await transformer.transformPayees(['Vendor A', 'Vendor B']);

        expect(result).toEqual({
            'Vendor A': 'Vendor A',
            'Vendor B': 'Vendor B',
        });

        expect(logger.warn).toHaveBeenCalledWith(
            'OpenAI returned empty payload, falling back to original payee names',
            ['This may indicate the model failed to process the request properly']
        );
    });

    it('handles duplicate keys in OpenAI payload by falling back to original payee names', async () => {
        const PayeeTransformer = await importTransformer();
        const logger = createLogger();
        const transformer = new PayeeTransformer(
            {
                enabled: true,
                openAiApiKey: 'key',
                openAiModel: 'gpt-3.5-turbo',
                skipModelValidation: false,
                maskPayeeNamesInLogs: false,
            },
            logger
        );

        // Mock OpenAI to return payload with duplicate keys
        // Note: This is technically invalid JSON, but we want to test the duplicate key detection
        createMock.mockImplementation(async () => ({
            choices: [
                {
                    message: {
                        content: '{"Vendor A": "Normalized A", "Vendor A": "Normalized B"}',
                    },
                },
            ],
        }));

        const result = await transformer.transformPayees(['Vendor A', 'Vendor B']);

        expect(result).toEqual({
            'Vendor A': 'Vendor A',
            'Vendor B': 'Vendor B',
        });

        expect(logger.warn).toHaveBeenCalledWith(
            'OpenAI response contains duplicate keys, falling back to original payee names',
            ['This indicates malformed response structure']
        );
    });
});
