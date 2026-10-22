import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Match the server's configured port; the browser calls /api without seeing credentials.
  server: { proxy: { '/api': { target: `http://localhost:${loadEnv(mode, '.', 'ROUTING_').ROUTING_PROXY_PORT || 8787}`, changeOrigin: false } } },
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
