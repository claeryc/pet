import { defineConfig } from '@playwright/test';

// The smoke test (npm run e2e): plays through the game in Chromium against
// the dev server, at a normal and a small phone size.
const PORT = 5174;

export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 180_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'phone-390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'phone-320', use: { browserName: 'chromium', viewport: { width: 320, height: 568 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
