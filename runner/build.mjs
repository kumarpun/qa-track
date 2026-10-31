// Bundles the shared browser engine + server into one file; only playwright-core stays an npm dependency.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({
  entryPoints: [path.join(root, "runner/src/cli.mjs")],
  outfile: path.join(root, "runner/dist/cli.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: ["playwright-core", "@sparticuz/chromium"],
  alias: { "@": root, "server-only": path.join(root, "runner/src/empty.mjs") },
  logLevel: "info",
});
