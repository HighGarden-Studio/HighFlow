import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@electron': fileURLToPath(new URL('./electron', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/renderer/shared', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/renderer/modules', import.meta.url)),
      '@services': fileURLToPath(new URL('./src/services', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'tests/unit/**/*.spec.ts',
      'tests/integration/**/*.spec.ts',
    ],
    exclude: [
      'node_modules',
      'dist',
      'dist-electron',
      'e2e/**/*',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'dist-electron/',
        'e2e/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types/**',
        '**/*.d.ts',
        'tests/**',
        'scripts/**',
        'electron/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Mock modules that don't work in jsdom
    deps: {
      inline: [
        'vue',
        '@vue',
        'pinia',
        '@vueuse',
      ],
    },
    // Reporter configuration
    reporters: ['default', 'html'],
    outputFile: {
      html: './coverage/test-report.html',
    },
  },
});
