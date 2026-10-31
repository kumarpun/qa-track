// Node module-resolution hooks so the runner can import the app's browser engine as-is:
// "@/x" -> project root, extensionless relative imports -> ".js", and "server-only" -> empty (it only guards Next bundles).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withExt = (file) => [file, `${file}.js`, `${file}.mjs`].find((f) => existsSync(f) && !f.endsWith(path.sep));

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  let file = null;
  if (specifier.startsWith("@/")) file = withExt(path.join(root, specifier.slice(2)));
  else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) file = withExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  return file && path.extname(file) ? { url: pathToFileURL(file).href, shortCircuit: true } : next(specifier, context);
}
