import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        exclude: ['**/node_modules/**'],
        environment: 'node',
        globals: true,
        clearMocks: true,
        restoreMocks: true,
        unstubEnvs: true,
        hookTimeout: 30000,
        setupFiles: ['./tests/setup.ts'],
        // Explícito de propósito: o default antigo era `numCPUs - 1`, o que vira 1 worker no runner
        // de 2 vCPU do GitHub (suíte em série). `100%` usa todos os núcleos — 2 no CI, todos na
        // máquina do dev.
        maxWorkers: '100%',
        // `isolate: false` foi medido e recusado no Opex/CRM: reusa o worker entre arquivos, mas o
        // estado de módulo vaza (mocks, caches, singleton do Pusher, `process.env`) e boa parte dos
        // arquivos falha. Não religue sem antes tornar a suíte inteira livre de estado compartilhado.
        //
        // Ambiente de DOM: declare `@vitest-environment happy-dom` por arquivo (monta em ~metade do
        // tempo do jsdom). `jsdom` só como exceção, com o motivo no docblock (AGENTS.md, seção 5).
        // Sem package.json: todo commit sobe a versão, e o gatilho padrão faria `vitest --changed`
        // rodar a suíte inteira (AGENTS.md, seção 5, "Rodando os testes").
        forceRerunTriggers: ['**/{vitest,vite}.config.*/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
