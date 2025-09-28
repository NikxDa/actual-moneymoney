import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BufferEncoding } from 'node:buffer';

type CliSpawnOptions = Pick<SpawnOptions, 'cwd' | 'env'>;

export interface CliRunOptions extends CliSpawnOptions {
    readonly input?: string;
    readonly timeoutMs?: number;
    readonly nodeOptions?: readonly string[];
}

export interface CliRunResult {
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stdout: string;
    readonly stderr: string;
}

const require = createRequire(import.meta.url);
const typescriptCli: string = require.resolve('typescript/bin/tsc');

const repoRoot: string = fileURLToPath(new URL('../../', import.meta.url));
const cliEntryPoint: string = path.join(repoRoot, 'dist', 'index.js');

const TEXT_ENCODING: BufferEncoding = 'utf8';
const KILL_GRACE_PERIOD_MS = 2000 as const;

let buildPromise: Promise<void> | null = null;

async function ensureCliBuilt(): Promise<void> {
    if (!buildPromise) {
        buildPromise = new Promise((resolve, reject) => {
            const buildEnv = createCliEnv();

            const buildProcess = spawn(
                process.execPath,
                [typescriptCli, '--project', 'tsconfig.json'],
                {
                    cwd: repoRoot,
                    env: buildEnv,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }
            );

            let stderr = '';
            let stdout = '';

            buildProcess.stdout?.setEncoding(TEXT_ENCODING);
            buildProcess.stderr?.setEncoding(TEXT_ENCODING);

            buildProcess.stdout?.on('data', (chunk) => {
                stdout += chunk;
            });

            buildProcess.stderr?.on('data', (chunk) => {
                stderr += chunk;
            });

            buildProcess.on('error', (error) => {
                buildPromise = null;
                reject(error);
            });

            buildProcess.on('close', (exitCode) => {
                if (exitCode === 0) {
                    resolve();
                    return;
                }

                buildPromise = null;
                const error = new Error(
                    `tsc exited with code ${exitCode}.\n${stdout}${stderr}`
                );
                reject(error);
            });
        });
    }

    await buildPromise;
}

export function createCliEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
        ...process.env,
        NODE_ENV: 'test',
        FORCE_COLOR: '0',
        ...overrides,
    };
}

export async function runCli(
    args: readonly string[],
    options: CliRunOptions = {}
): Promise<CliRunResult> {
    await ensureCliBuilt();

    const baseEnv = createCliEnv();
    const spawnOptions: SpawnOptions = {
        cwd: options.cwd ?? repoRoot,
        env: options.env ? { ...baseEnv, ...options.env } : baseEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
    };

    const nodeArgs = [
        ...(options.nodeOptions ? [...options.nodeOptions] : []),
        cliEntryPoint,
        ...args,
    ];
    const childProcess = spawn(process.execPath, nodeArgs, spawnOptions);

    if (options.input) {
        childProcess.stdin?.write(options.input);
    }
    childProcess.stdin?.end();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    childProcess.stdout?.setEncoding(TEXT_ENCODING);
    childProcess.stderr?.setEncoding(TEXT_ENCODING);

    childProcess.stdout?.on('data', (chunk) => {
        stdoutChunks.push(chunk);
    });

    childProcess.stderr?.on('data', (chunk) => {
        stderrChunks.push(chunk);
    });

    return new Promise((resolve, reject) => {
        let timedOut = false;
        let timeout: NodeJS.Timeout | undefined;
        let forceKill: NodeJS.Timeout | undefined;

        if (typeof options.timeoutMs === 'number') {
            timeout = setTimeout(() => {
                timedOut = true;
                // Try graceful shutdown first
                childProcess.kill('SIGTERM');
                // Escalate if the process refuses to die
                forceKill = setTimeout(() => {
                    childProcess.kill('SIGKILL');
                }, KILL_GRACE_PERIOD_MS);
            }, options.timeoutMs);
        }

        childProcess.on('error', (error) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (forceKill) {
                clearTimeout(forceKill);
            }
            reject(error);
        });

        childProcess.on('close', (exitCode, signal) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (forceKill) {
                clearTimeout(forceKill);
            }

            if (timedOut) {
                reject(new Error('CLI process timed out'));
                return;
            }

            resolve({
                exitCode,
                signal,
                stdout: stdoutChunks.join(''),
                stderr: stderrChunks.join(''),
            });
        });
    });
}

export async function getCliEntrypoint(): Promise<string> {
    await ensureCliBuilt();
    return cliEntryPoint;
}
