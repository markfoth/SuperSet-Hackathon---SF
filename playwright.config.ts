import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://localhost:5187', channel: 'chrome', reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1512, height: 982 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  // Keep regression tests offline even when the developer has live credentials in .env.
  webServer: { command: 'npm run dev -- --host localhost --port 5187 --strictPort', url: 'http://localhost:5187', reuseExistingServer: false,
    env: { VITE_COMMUTE_PROVIDER: 'fixture' } },
});
