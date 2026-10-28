import "server-only";
import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { query, queryOne, uuid } from "../db";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { hasRole } from "@/lib/permissions";

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_EXECUTION = 10;

// Extension decides the stored/served type; the client-supplied MIME is never trusted.
// No SVG/HTML: they can carry script and would run on our origin if served inline.
const TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf", txt: "text/plain", log: "text/plain", csv: "text/csv", json: "application/json",
  mp4: "video/mp4", webm: "video/webm", zip: "application/zip",
};
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

const uploadRoot = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./uploads");

/** Storage keys are `<projectId>/<uuid>`; resolve and verify the path stays inside the upload root. */
function absolutePath(storageKey) {
  const root = uploadRoot();
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep)) throw new AppError("Invalid storage key", { status: 500, code: "INTEGRITY" });
  return full;
}

const cleanName = (n) => n.replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 200) || "file";

export async function getExecutionProjectId(executionId) {
  const row = await queryOne(
    `SELECT r.project_id FROM test_executions e JOIN test_run_cases c ON c.id = e.run_case_id
     JOIN test_runs r ON r.id = c.run_id WHERE e.id = ?`,
    [executionId],
  );
  return row?.project_id ?? null;
}

export async function getAttachmentProjectId(id) {
  const row = await queryOne("SELECT project_id FROM attachments WHERE id = ?", [id]);
  return row?.project_id ?? null;
}

export async function saveAttachment(ctx, executionId, file) {
  if (!file || typeof file.arrayBuffer !== "function") throw new AppError("No file received");
  const name = cleanName(file.name || "file");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const mime = TYPES[ext];
  if (!mime) throw new AppError(`File type .${ext || "?"} is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
  if (file.size === 0) throw new AppError(`${name} is empty`);
  if (file.size > MAX_FILE_BYTES) throw new AppError(`${name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);

  const ex = await queryOne(
    `SELECT e.id FROM test_executions e JOIN test_run_cases c ON c.id = e.run_case_id JOIN test_runs r ON r.id = c.run_id
     WHERE e.id = ? AND r.project_id = ?`,
    [executionId, ctx.project.id],
  );
  if (!ex) throw notFound("Execution not found");
  const { n } = await queryOne("SELECT COUNT(*) AS n FROM attachments WHERE execution_id = ?", [executionId]);
  if (n >= MAX_FILES_PER_EXECUTION) throw new AppError(`At most ${MAX_FILES_PER_EXECUTION} files per execution`);

  const id = uuid();
  const key = `${ctx.project.id}/${id}`;
  const full = /*turbopackIgnore: true*/ absolutePath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()));
  try {
    await query(
      "INSERT INTO attachments (id, project_id, file_name, mime_type, size_bytes, storage_key, uploaded_by, execution_id) VALUES (?,?,?,?,?,?,?,?)",
      [id, ctx.project.id, name, mime, file.size, key, ctx.user.id, executionId],
    );
  } catch (e) {
    await unlink(full).catch(() => {});
    throw e;
  }
  await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "attachment.added", entityType: "attachment", entityId: id, metadata: { name, bytes: file.size } });
  return { id, name };
}

/** Read an attachment of the authorized project; returns bytes plus safe response headers. */
export async function readAttachment(ctx, id) {
  const a = await queryOne("SELECT * FROM attachments WHERE id = ? AND project_id = ?", [id, ctx.project.id]);
  if (!a) throw notFound("Attachment not found");
  let bytes;
  try { bytes = await readFile(/*turbopackIgnore: true*/ absolutePath(a.storage_key)); } catch { throw notFound("File is missing"); }
  const inline = INLINE.has(a.mime_type);
  return {
    bytes,
    headers: {
      "Content-Type": a.mime_type,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.file_name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  };
}

/** Uploader or QA Lead+ may remove a file. */
export async function deleteAttachment(ctx, id) {
  const a = await queryOne("SELECT * FROM attachments WHERE id = ? AND project_id = ?", [id, ctx.project.id]);
  if (!a) throw notFound("Attachment not found");
  if (a.uploaded_by !== ctx.user.id && !hasRole(ctx.role, "QA_LEAD")) throw new AppError("Only the uploader or a QA Lead can remove this file", { status: 403, code: "FORBIDDEN" });
  await query("DELETE FROM attachments WHERE id = ?", [id]);
  await unlink(absolutePath(a.storage_key)).catch(() => {});
  await audit({ userId: ctx.user.id, projectId: ctx.project.id, action: "attachment.removed", entityType: "attachment", entityId: id, metadata: { name: a.file_name } });
}
