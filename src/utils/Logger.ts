export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

class Logger {
    private logLevel: LogLevel = LogLevel.INFO;

    constructor(logLevel = LogLevel.INFO) {
        this.logLevel = logLevel;
    }

    public setLogLevel(level: LogLevel) {
        this.logLevel = level;
    }

    public error(message: string) {
        if (this.logLevel >= LogLevel.ERROR) {
            console.error('[ERROR]', message);
        }
    }

    public warn(message: string) {
        if (this.logLevel >= LogLevel.WARN) {
            console.warn('[WARN]', message);
        }
    }

    public info(message: string) {
        if (this.logLevel >= LogLevel.INFO) {
            console.log('[INFO]', message);
        }
    }

    public debug(message: string) {
        if (this.logLevel >= LogLevel.DEBUG) {
            console.debug('[DEBUG]', message);
        }
    }
}

export default Logger;
