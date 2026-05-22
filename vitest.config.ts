import { defineConfig, defineProject } from 'vitest/config';
import path from 'path';

const alias = {
    '@': path.resolve(__dirname, './src'),
};

export default defineConfig({
    test: {
        projects: [
            defineProject({
                resolve: {
                    alias,
                },
                test: {
                    name: 'backend',
                    environment: 'node',
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    unstubEnvs: true,
                    setupFiles: ['./tests/backend/setup.ts'],
                    include: ['tests/backend/**/*.test.ts'],
                    exclude: ['**/node_modules/**'],
                },
            }),
            defineProject({
                resolve: {
                    alias,
                },
                test: {
                    name: 'frontend',
                    environment: 'jsdom',
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    unstubEnvs: true,
                    setupFiles: ['./tests/backend/setup.ts', './tests/frontend/setup.ts'],
                    include: [
                        'tests/frontend/**/*.test.ts',
                        'tests/frontend/**/*.test.tsx',
                        'tests/owlbear/**/*.test.ts',
                        'tests/owlbear/**/*.test.tsx',
                    ],
                    exclude: ['**/node_modules/**'],
                },
            }),
            defineProject({
                resolve: {
                    alias,
                },
                test: {
                    name: 'scripts',
                    environment: 'node',
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    unstubEnvs: true,
                    setupFiles: ['./tests/backend/setup.ts'],
                    include: ['tests/scripts/**/*.test.ts'],
                    exclude: ['**/node_modules/**'],
                },
            }),
        ],
    },
    resolve: {
        alias,
    },
});
