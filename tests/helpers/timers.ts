import { vi } from 'vitest';

export async function withFakeTimers<T>(fn: () => Promise<T>): Promise<T> {
    vi.useFakeTimers();
    try {
        const result = await fn();
        await vi.runOnlyPendingTimersAsync();
        vi.clearAllTimers();
        return result;
    } finally {
        vi.useRealTimers();
    }
}
