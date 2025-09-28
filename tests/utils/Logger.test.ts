import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Logger, { LogLevel } from '../../src/utils/Logger.js';

const FIXED_DATE = new Date('2024-02-29T12:34:56.789Z');

describe('Logger', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_DATE);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('emits structured JSON logs when enabled', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
            // noop
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
            // noop
        });

        const logger = new Logger(LogLevel.DEBUG, { structuredLogs: true });

        logger.info('Structured info message', ['first hint', 'second hint']);

        expect(logSpy).toHaveBeenCalledWith(
            JSON.stringify({
                level: 'INFO',
                timestamp: FIXED_DATE.toISOString(),
                message: 'Structured info message',
                hints: ['first hint', 'second hint'],
            })
        );
        expect(errorSpy).not.toHaveBeenCalled();

        logSpy.mockClear();

        const error = new Error('kaboom');
        error.stack = ['Error: kaboom', '    at fake.ts:1:1'].join('\n');

        logger.error('Structured error message', error);

        expect(errorSpy).toHaveBeenCalledWith(
            JSON.stringify({
                level: 'ERROR',
                timestamp: FIXED_DATE.toISOString(),
                message: 'Structured error message',
                hints: ['Error: kaboom', 'at fake.ts:1:1'],
            })
        );
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('retains coloured output when structured logs are disabled', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
            // noop
        });

        const logger = new Logger(LogLevel.INFO);

        logger.info('classic message', 'hint text');

        expect(logSpy).toHaveBeenCalled();
        const [firstArg, secondArg] = logSpy.mock.calls[0];
        expect(String(firstArg)).toContain('[INFO]');
        expect(String(secondArg)).toBe(`[${FIXED_DATE.toISOString()}]`);
    });
});
