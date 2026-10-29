import "server-only";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { uuid } from "../db";
import { AppError } from "../errors";

const uploadRoot = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./uploads");

/** Keys look like `<projectId>/auto/<uuid>.png`; resolve and verify the path stays inside the upload root. */
function absolutePath(key) {
  const root = uploadRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new AppError("Invalid storage key", { status: 500, code: "INTEGRITY" });
  return full;
}

export async function saveShot(projectId, bytes) {
  const key = `${projectId}/auto/${uuid()}.png`;
  const full = absolutePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return key;
}

export const readShot = (key) => readFile(absolutePath(key));
