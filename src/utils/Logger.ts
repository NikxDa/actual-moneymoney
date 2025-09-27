import chalk from 'chalk';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

type LogHint = string | Error | Array<string | Error>;

class Logger {
    private logLevel: LogLevel;

    constructor(logLevel = LogLevel.INFO) {
        this.logLevel = logLevel;
    }

    public setLogLevel(level: LogLevel) {
        this.logLevel = level;
    }

    public error(message: string, hint?: LogHint) {
        this.log(LogLevel.ERROR, message, hint);
    }

    public warn(message: string, hint?: LogHint) {
        this.log(LogLevel.WARN, message, hint);
    }

    public info(message: string, hint?: LogHint) {
        this.log(LogLevel.INFO, message, hint);
    }

    public debug(message: string, hint?: LogHint) {
        this.log(LogLevel.DEBUG, message, hint);
    }

    private log(level: LogLevel, message: string, hint?: LogHint) {
        if (this.logLevel >= level) {
            const timestamp = new Date().toISOString();
            const prefix = `[${LogLevel[level].toUpperCase()}]`;
            const chalkColor = {
                [LogLevel.ERROR]: chalk.red,
                [LogLevel.WARN]: chalk.yellow,
                [LogLevel.INFO]: chalk.cyan,
                [LogLevel.DEBUG]: chalk.gray,
            }[level];

            console.log(chalkColor(prefix), `[${timestamp}]`, message);
            const hints = this.normaliseHints(hint);
            if (hints.length > 0) {
                const hintIndent = ' '.repeat(
                    `${prefix} [${timestamp}] `.length
                );
                for (const line of hints) {
                    console.log(chalk.gray(hintIndent, '↳ ', line));
                }
            }
        }
    }

    private normaliseHints(hint?: LogHint): string[] {
        if (!hint) {
            return [];
        }

        const rawHints = Array.isArray(hint) ? hint : [hint];
        const normalised: string[] = [];

        for (const entry of rawHints) {
            if (entry instanceof Error) {
                const stack = entry.stack;
                if (stack) {
                    const max = 15;
                    const raw = stack.split('\n');
                    const lines = raw
                        .slice(0, max)
                        .map((line) => line.trim())
                        .filter((line) => line.length);
                    if (raw.length > max) {
                        lines.push(`… ${raw.length - max} more lines`);
                    }
                    if (lines.length > 0) {
                        normalised.push(...lines);
                        continue;
                    }
                }
                normalised.push(`Error: ${entry.message || entry.name}`);
                continue;
            }

            normalised.push(entry);
        }

        return normalised;
    }

    public getLevel(): LogLevel {
        return this.logLevel;
    }
}

export default Logger;
