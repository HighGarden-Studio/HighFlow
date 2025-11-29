import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@electron': fileURLToPath(new URL('./electron', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/renderer/shared', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/renderer/modules', import.meta.url)),
    },
  },
  define: {
    // Buffer polyfill을 제공하지 않음 (서버 전용 코드 방지)
    'global': 'globalThis',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
          'ai-core': ['openai', '@anthropic-ai/sdk', '@google/generative-ai'],
          'charts': ['echarts', 'vue-echarts'],
          'collaboration': ['yjs', 'y-websocket', 'y-indexeddb'],
          'ui-components': ['radix-vue', 'cmdk-vue'],
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
    exclude: ['better-sqlite3', 'jsonwebtoken', 'socket.io'],
  },
});
