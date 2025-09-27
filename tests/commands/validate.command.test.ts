import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArgumentsCamelCase } from 'yargs';

import { EXAMPLE_CONFIG } from '../../src/utils/shared.js';

const readFileMock = vi.fn<typeof import('node:fs/promises')['readFile']>();
const writeFileMock = vi.fn<typeof import('node:fs/promises')['writeFile']>();
const mkdirMock = vi.fn<typeof import('node:fs/promises')['mkdir']>();

vi.mock('node:fs/promises', () => ({
    __esModule: true,
    default: {
        readFile: readFileMock,
        writeFile: writeFileMock,
        mkdir: mkdirMock,
    },
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: mkdirMock,
}));

const getConfigFileMock = vi.fn<
    typeof import('../../src/utils/config.js')['getConfigFile']
>();
const configSchemaParseMock = vi.fn();

vi.mock('../../src/utils/config.js', () => ({
    __esModule: true,
    getConfigFile: getConfigFileMock,
    configSchema: {
        parse: configSchemaParseMock,
    },
}));

const LogLevelMock = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 } as const;

let loggerInfoMock: ReturnType<typeof vi.fn>;
let loggerWarnMock: ReturnType<typeof vi.fn>;
let loggerErrorMock: ReturnType<typeof vi.fn>;
let loggerDebugMock: ReturnType<typeof vi.fn>;

const loggerConstructorMock = vi.fn();

vi.mock('../../src/utils/Logger.js', () => ({
    __esModule: true,
    default: loggerConstructorMock,
    LogLevel: LogLevelMock,
}));

describe('validate command', () => {
    beforeEach(() => {
        vi.resetModules();

        readFileMock.mockReset();
        writeFileMock.mockReset();
        mkdirMock.mockReset();
        getConfigFileMock.mockReset();
        configSchemaParseMock.mockReset();
        loggerConstructorMock.mockReset();

        loggerInfoMock = vi.fn();
        loggerWarnMock = vi.fn();
        loggerErrorMock = vi.fn();
        loggerDebugMock = vi.fn();

        loggerConstructorMock.mockImplementation(() => ({
            info: loggerInfoMock,
            warn: loggerWarnMock,
            error: loggerErrorMock,
            debug: loggerDebugMock,
        }));
    });

    it('creates parent directories when config file is missing', async () => {
        const configPath = 'tmp/custom/config.toml';

        getConfigFileMock.mockResolvedValue(configPath);
        readFileMock.mockRejectedValue(
            Object.assign(new Error('missing'), { code: 'ENOENT' })
        );
        writeFileMock.mockResolvedValue();
        mkdirMock.mockResolvedValue(undefined);

        const { default: commandModule } = await import(
            '../../src/commands/validate.command.js'
        );

        if (!commandModule.handler) {
            throw new Error('validate command handler not registered');
        }

        await commandModule.handler({
            _: [],
            $0: 'test',
        } as ArgumentsCamelCase);

        expect(mkdirMock).toHaveBeenCalledWith('tmp/custom', { recursive: true });
        expect(writeFileMock).toHaveBeenCalledWith(
            configPath,
            EXAMPLE_CONFIG,
            { encoding: 'utf-8', mode: 0o600 }
        );
        expect(configSchemaParseMock).not.toHaveBeenCalled();
    });

    it('initialises the current directory when config file path has no parent', async () => {
        const configPath = 'config.toml';

        getConfigFileMock.mockResolvedValue(configPath);
        readFileMock.mockRejectedValue(
            Object.assign(new Error('missing'), { code: 'ENOENT' })
        );
        writeFileMock.mockResolvedValue();
        mkdirMock.mockResolvedValue(undefined);

        const { default: commandModule } = await import(
            '../../src/commands/validate.command.js'
        );

        if (!commandModule.handler) {
            throw new Error('validate command handler not registered');
        }

        await commandModule.handler({
            _: [],
            $0: 'test',
        } as ArgumentsCamelCase);

        expect(mkdirMock).toHaveBeenCalledWith('.', { recursive: true });
        expect(writeFileMock).toHaveBeenCalledWith(
            configPath,
            EXAMPLE_CONFIG,
            { encoding: 'utf-8', mode: 0o600 }
        );
    });

    it('logs and rethrows when the configuration directory cannot be created', async () => {
        const configPath = 'tmp/custom/config.toml';
        const mkdirError = new Error('permission denied');

        getConfigFileMock.mockResolvedValue(configPath);
        readFileMock.mockRejectedValue(
            Object.assign(new Error('missing'), { code: 'ENOENT' })
        );
        mkdirMock.mockRejectedValue(mkdirError);

        const { default: commandModule } = await import(
            '../../src/commands/validate.command.js'
        );

        if (!commandModule.handler) {
            throw new Error('validate command handler not registered');
        }

        await expect(
            commandModule.handler({
                _: [],
                $0: 'test',
            } as ArgumentsCamelCase)
        ).rejects.toThrow(mkdirError);

        expect(loggerErrorMock).toHaveBeenCalledWith(
            'Failed to create configuration directory.',
            ['Path: tmp/custom', 'Reason: permission denied']
        );
        expect(writeFileMock).not.toHaveBeenCalled();
    });

    it('logs and rethrows when the configuration file cannot be written', async () => {
        const configPath = 'tmp/custom/config.toml';
        const writeError = new Error('disk full');

        getConfigFileMock.mockResolvedValue(configPath);
        readFileMock.mockRejectedValue(
            Object.assign(new Error('missing'), { code: 'ENOENT' })
        );
        mkdirMock.mockResolvedValue(undefined);
        writeFileMock.mockRejectedValue(writeError);

        const { default: commandModule } = await import(
            '../../src/commands/validate.command.js'
        );

        if (!commandModule.handler) {
            throw new Error('validate command handler not registered');
        }

        await expect(
            commandModule.handler({
                _: [],
                $0: 'test',
            } as ArgumentsCamelCase)
        ).rejects.toThrow(writeError);

        expect(loggerErrorMock).toHaveBeenCalledWith(
            'Failed to create configuration file.',
            ['Path: tmp/custom/config.toml', 'Reason: disk full']
        );
    });
});
