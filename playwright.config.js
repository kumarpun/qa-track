import "dotenv/config";
import { defineConfig } from "@playwright/test";

// E2E runs against its own server and database (TEST_DB_NAME), never the dev server / real data.
const TEST_DB_NAME = process.env.TEST_DB_NAME || "qa_platform_test";
if (TEST_DB_NAME === process.env.DB_NAME) throw new Error("TEST_DB_NAME must differ from DB_NAME");
process.env.TEST_DB_NAME = TEST_DB_NAME;

const PORT = process.env.E2E_PORT || 3100;
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  expect: { timeout: 15000 }, // dev server compiles pages on first hit
  globalSetup: "./e2e/global-setup.js",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120000,
    env: { DB_NAME: TEST_DB_NAME, NEXT_DIST_DIR: ".next-e2e" },
  },
});
