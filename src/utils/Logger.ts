export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    ACTUAL = 4,
}

type LogHint = string | string[];

type Color = 'red' | 'yellow' | 'cyan' | 'gray' | 'magenta';

const colorizeText = (color: Color, text: string) => {
    const codes: Record<Color, string> = {
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        cyan: '\x1b[36m',
        gray: '\x1b[90m',
        magenta: '\x1b[35m',
    };
    return `${codes[color]}${text}\x1b[0m`;
};

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
            const color: Color = {
                [LogLevel.ERROR]: 'red',
                [LogLevel.WARN]: 'yellow',
                [LogLevel.INFO]: 'cyan',
                [LogLevel.DEBUG]: 'gray',
                [LogLevel.ACTUAL]: 'magenta',
            }[level] as Color;

            this.consoleLog(colorizeText(color, prefix), message);
            if (hint) {
                const arrayHint = Array.isArray(hint) ? hint : [hint];
                for (const hint of arrayHint) {
                    this.consoleLog(
                        colorizeText(
                            'gray',
                            `${' '.repeat(prefix.length)} ↳ ${hint}`
                        )
                    );
                }
            }
        }
    }
}

export default Logger;
