import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `npm run proxy` serves live routing on :8787; the app calls it as /api (VITE_ROUTING_PROXY_URL=/api).
  server: { proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
