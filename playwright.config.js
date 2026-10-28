import { defineConfig } from "@playwright/test";

const PORT = process.env.E2E_PORT || 3000;
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
