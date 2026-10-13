import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'webkit-iphone',
      testIgnore: /skip-playable-4g/,
      use: {
        ...devices['iPhone 15'],
      },
    },
    {
      name: 'chromium-4g',
      testMatch: /skip-playable-4g/,
      use: {
        ...devices['Desktop Chrome'],
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/sunken-keep/proto3d.html',
    timeout: 180000,
    reuseExistingServer: !process.env.CI,
  },
});
