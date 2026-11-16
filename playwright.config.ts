import { defineConfig } from "@playwright/test";

const dockerBrowser = process.env.OPENSEO_DOCKER_BROWSER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: dockerBrowser ? "http://127.0.0.1:3001" : "http://localhost:3101",
    actionTimeout: 5_000,
    navigationTimeout: 30_000,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: dockerBrowser
    ? undefined
    : {
        command:
          "NODE_OPTIONS= AUTH_MODE=local_noauth VITE_E2E_DOMAIN_FIXTURES=1 VITE_E2E_KEYWORD_FIXTURES=1 PORT=3101 pnpm exec vite dev --host 127.0.0.1 --strictPort",
        url: "http://localhost:3101",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
