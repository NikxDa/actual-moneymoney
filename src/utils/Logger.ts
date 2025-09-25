import chalk from 'chalk';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

type LogHint = string | string[];

class Logger {
    private logLevel: LogLevel = LogLevel.INFO;

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
            if (hint) {
                const arrayHint = Array.isArray(hint) ? hint : [hint];
                const hintIndent = ' '.repeat(
                    `${prefix} [${timestamp}] `.length
                );
                for (const hint of arrayHint) {
                    console.log(chalk.gray(hintIndent, '↳ ', hint));
                }
            }
        }
    }

    public getLevel(): LogLevel {
        return this.logLevel;
    }
}

export default Logger;
