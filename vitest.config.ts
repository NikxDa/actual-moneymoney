import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        typecheck: {
            enabled: true,
            tsconfig: './tsconfig.test.json',
        },
        coverage: {
            reporter: ['text', 'html'],
            enabled: false,
        },
        env: {
            TZ: 'UTC',
        },
    },
});
