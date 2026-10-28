import { execFileSync } from "node:child_process";

// Builds the isolated test database so E2E never touches the real one.
export default function globalSetup() {
  const env = { ...process.env, DB_NAME: process.env.TEST_DB_NAME };
  for (const script of ["scripts/migrate.mjs", "scripts/seed.mjs"]) {
    execFileSync("node", [script], { env, stdio: "inherit" });
  }
}
