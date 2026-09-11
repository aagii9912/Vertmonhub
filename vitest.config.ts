// Тестүүд Улаанбаатарын цагийн бүсээр ажиллана (CI = UTC): local == Asia/Ulaanbaatar,
// ингэснээр `new Date(y, m, d)` fixture-ууд серверийн УБ-ийн өдрийн хилтэй тохирно.
process.env.TZ = 'Asia/Ulaanbaatar';

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
                'src/test/',
                '**/*.d.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
