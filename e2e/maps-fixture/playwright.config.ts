import { defineConfig } from "@playwright/test";
const baseURL = process.env.OPENSEO_MAPS_FIXTURE_URL;
if (!baseURL)
  throw Error(
    "Use pnpm exec tsx e2e/maps-fixture/run.ts to start the isolated fixture",
  );
export default defineConfig({
  testDir: "..",
  testMatch: "maps-collection.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  outputDir: "../../test-results/maps-fixture/browser",
});
