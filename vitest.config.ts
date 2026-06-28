import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['node_modules', '.next'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                '.next/',
                'e2e/',
                'src/test/',
                'src/types/**',
                '**/*.d.ts',
                '**/*.config.{ts,js,mjs,cts,mts}',
            ],
            // Ratchet floor — одоогийн хамралтаас (~33% stmts) хэдэн нэгжээр доогуур
            // тогтоосон. Хамралт буурвал CI унана. Тест нэмэгдэхэд аажмаар өсгөнө.
            thresholds: {
                statements: 34,
                branches: 24,
                functions: 37,
                lines: 36,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
