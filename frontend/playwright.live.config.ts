import { defineConfig, devices } from "@playwright/test";

const databaseUrl = process.env.E2E_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "E2E_DATABASE_URL must point to a disposable PostgreSQL database.",
  );
}

export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-live",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm --prefix ../backend run dev",
      url: "http://127.0.0.1:5101/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: databaseUrl,
        JWT_SECRET: "local-e2e-only-secret-not-for-deployment",
        PORT: "5101",
        FRONTEND_URL: "http://127.0.0.1:4174",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { VITE_API_URL: "http://127.0.0.1:5101" },
    },
  ],
});