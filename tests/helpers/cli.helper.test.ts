import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BufferEncoding } from 'node:buffer';
import type { spawn as Spawn } from 'node:child_process';

type MockStream = EventEmitter & {
    setEncoding: (encoding: BufferEncoding) => void;
};

type MockChildProcess = EventEmitter & {
    stdout: MockStream;
    stderr: MockStream;
    stdin: {
        write: (input: string) => void;
        end: () => void;
    };
    kill: (signal?: NodeJS.Signals) => void;
};

type SpawnParameters = Parameters<Spawn>;

const spawnMock = vi.fn<MockChildProcess, SpawnParameters>();

function createMockStream(): MockStream {
    const stream = new EventEmitter() as MockStream;
    stream.setEncoding = vi.fn();
    return stream;
}

function createMockProcess(): MockChildProcess {
    const child = new EventEmitter() as MockChildProcess;
    (child as MockChildProcess).stdout = createMockStream();
    (child as MockChildProcess).stderr = createMockStream();
    (child as MockChildProcess).stdin = {
        write: vi.fn(),
        end: vi.fn(),
    };
    child.kill = vi.fn();

    setTimeout(() => {
        child.emit('close', 0, null);
    }, 0);

    return child;
}

function createDeferredProcess(): MockChildProcess {
    const child = new EventEmitter() as MockChildProcess;
    (child as MockChildProcess).stdout = createMockStream();
    (child as MockChildProcess).stderr = createMockStream();
    (child as MockChildProcess).stdin = {
        write: vi.fn(),
        end: vi.fn(),
    };
    child.kill = vi.fn();

    return child;
}

vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    return {
        ...actual,
        spawn: spawnMock,
    };
});

beforeEach(async () => {
    await vi.resetModules();
    spawnMock.mockReset();
    spawnMock.mockImplementation((..._args) => createMockProcess());
});

describe('createCliEnv', () => {
    const overriddenKey = '__CLI_HELPER_TEST_OVERRIDE__';
    const preservedKey = '__CLI_HELPER_TEST_PRESERVE__';

    afterEach(() => {
        delete process.env[overriddenKey];
        delete process.env[preservedKey];
    });

    it('merges overrides into the base CLI environment', async () => {
        process.env[overriddenKey] = 'base-value';
        process.env[preservedKey] = 'base-preserved';
        const { createCliEnv } = await import('./cli.ts');

        const env = createCliEnv({
            [overriddenKey]: 'override-value',
            NODE_ENV: 'custom',
            EXTRA: 'value',
        });

        expect(env).not.toBe(process.env);
        expect(env[overriddenKey]).toBe('override-value');
        expect(env[preservedKey]).toBe('base-preserved');
        expect(env.EXTRA).toBe('value');
        expect(env.NODE_ENV).toBe('custom');
        expect(env.FORCE_COLOR).toBe('0');
    });
});

describe('getCliEntrypoint', () => {
    it('builds the CLI once and caches the entrypoint path', async () => {
        const { getCliEntrypoint } = await import('./cli.ts');

        const first = await getCliEntrypoint();
        const second = await getCliEntrypoint();

        expect(first).toBe(second);
        expect(spawnMock).toHaveBeenCalledTimes(1);
    });
});

describe('runCli (timeouts and I/O)', () => {
    it('escalates from SIGTERM to SIGKILL on timeout and rejects', async () => {
        const { getCliEntrypoint, runCli } = await import('./cli.ts');
        await getCliEntrypoint();

        vi.useFakeTimers();
        try {
            const deferredProcess = createDeferredProcess();
            spawnMock.mockReset();
            spawnMock.mockImplementation((..._args) => deferredProcess);

            const runPromise = runCli(['--noop'], { timeoutMs: 1000 });

            await vi.advanceTimersByTimeAsync(1000);
            expect(deferredProcess.kill).toHaveBeenCalledWith('SIGTERM');

            await vi.advanceTimersByTimeAsync(2000);
            expect(deferredProcess.kill).toHaveBeenCalledWith('SIGKILL');

            (deferredProcess as EventEmitter).emit('close', null, 'SIGKILL');

            await expect(runPromise).rejects.toThrow('CLI process timed out');
        } finally {
            vi.useRealTimers();
        }
    });

    it('sets utf8 encoding on stdout and stderr', async () => {
        const { getCliEntrypoint, runCli } = await import('./cli.ts');
        await getCliEntrypoint();
        const runProcess = createMockProcess();
        spawnMock.mockReset();
        spawnMock.mockImplementation((..._args) => runProcess);

        await runCli(['--noop']);
        expect(runProcess.stdout.setEncoding).toHaveBeenCalledWith('utf8');
        expect(runProcess.stderr.setEncoding).toHaveBeenCalledWith('utf8');
    });

    it('includes custom node options when provided', async () => {
        const { getCliEntrypoint, runCli } = await import('./cli.ts');
        const entryPoint = await getCliEntrypoint();
        const runProcess = createMockProcess();
        spawnMock.mockReset();
        spawnMock.mockImplementation((..._args) => runProcess);

        await runCli(['--noop'], {
            nodeOptions: ['--loader', '/tmp/mock-loader.mjs'],
        });

        expect(spawnMock).toHaveBeenCalledWith(
            process.execPath,
            ['--loader', '/tmp/mock-loader.mjs', entryPoint, '--noop'],
            expect.any(Object)
        );
    });
});
