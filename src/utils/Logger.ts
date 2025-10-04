import chalk from 'chalk';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    ACTUAL = 4,
}

type LogHint = string | string[];

class Logger {
    public logLevel: LogLevel = LogLevel.INFO;

    // We use a private reference to console.log to allow suppressing logs in other parts of the code
    private consoleLog = console.log;

    constructor(logLevel = LogLevel.INFO) {
        this.logLevel = logLevel;
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

    public actual(message: string, hint?: LogHint) {
        this.log(LogLevel.ACTUAL, message, hint);
    }

    private log(level: LogLevel, message: string, hint?: LogHint) {
        if (this.logLevel >= level) {
            const prefix = `[${LogLevel[level].toUpperCase()}]`;
            const chalkColor = {
                [LogLevel.ERROR]: chalk.red,
                [LogLevel.WARN]: chalk.yellow,
                [LogLevel.INFO]: chalk.cyan,
                [LogLevel.DEBUG]: chalk.gray,
                [LogLevel.ACTUAL]: chalk.magenta,
            }[level];

            this.consoleLog(chalkColor(prefix), message);
            if (hint) {
                const arrayHint = Array.isArray(hint) ? hint : [hint];
                for (const hint of arrayHint) {
                    this.consoleLog(
                        chalk.gray(' '.repeat(prefix.length), '↳', hint)
                    );
                }
            }
        }
    }
}

export default Logger;
