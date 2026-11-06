import "server-only";
import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { query, queryOne, uuid } from "../db";
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

/** Evidence on a completed or cancelled run is frozen until the run is reopened. */
function assertRunOpen(status) {
  if (status !== "DRAFT" && status !== "IN_PROGRESS") throw new AppError(`This run is ${status.toLowerCase()}; reopen it to change attachments`, { code: "RUN_CLOSED", status: 409 });
}

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
    `SELECT e.id, r.status AS run_status FROM test_executions e JOIN test_run_cases c ON c.id = e.run_case_id JOIN test_runs r ON r.id = c.run_id
     WHERE e.id = ? AND r.project_id = ?`,
    [executionId, ctx.project.id],
  );
  if (!ex) throw notFound("Execution not found");
  assertRunOpen(ex.run_status);
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
  const a = await queryOne(
    `SELECT a.*, r.status AS run_status FROM attachments a
     LEFT JOIN test_executions e ON e.id = a.execution_id LEFT JOIN test_run_cases c ON c.id = e.run_case_id LEFT JOIN test_runs r ON r.id = c.run_id
     WHERE a.id = ? AND a.project_id = ?`,
    [id, ctx.project.id],
  );
  if (!a) throw notFound("Attachment not found");
  if (a.run_status) assertRunOpen(a.run_status);
  if (a.uploaded_by !== ctx.user.id && !hasRole(ctx.role, "QA_LEAD")) throw new AppError("Only the uploader or a QA Lead can remove this file", { status: 403, code: "FORBIDDEN" });
  await query("DELETE FROM attachments WHERE id = ?", [id]);
  await unlink(absolutePath(a.storage_key)).catch(() => {});
}

/** Best-effort removal of stored files whose rows are already gone (e.g. after a run is deleted). */
export async function removeStoredFiles(storageKeys) {
  await Promise.all(storageKeys.map((k) => unlink(absolutePath(k)).catch(() => {})));
}

// Images that test steps upload into a page ("Upload Image: logo.png") live on freeimage.host, not on this server's disk or in the repo.
// The attachments row keeps the hosted URL in storage_key (unique per upload); nothing is written locally.
const STEP_FILE_TYPES = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const FREEIMAGE_API = "https://freeimage.host/api/1/upload";
const FREEIMAGE_HOSTS = /^(?:freeimage\.host|iili\.io)$/i;

/** Only freeimage.host URLs are ever fetched by the runner: the stored URL is data, not a place to send the server. */
export const isStepFileUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && FREEIMAGE_HOSTS.test(x.hostname);
  } catch {
    return false;
  }
};

export async function saveStepFile(ctx, file) {
  if (!file || typeof file.arrayBuffer !== "function") throw new AppError("No file received");
  const name = cleanName(file.name || "file");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (!STEP_FILE_TYPES.has(ext)) throw new AppError(`Only images can be uploaded here (${[...STEP_FILE_TYPES].join(", ")})`);
  if (file.size === 0) throw new AppError(`${name} is empty`);
  if (file.size > MAX_FILE_BYTES) throw new AppError(`${name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  const apiKey = process.env.FREEIMAGE_API_KEY;
  if (!apiKey) throw new AppError("Image upload is not configured (set FREEIMAGE_API_KEY)", { status: 500, code: "NOT_CONFIGURED" });

  const body = new FormData();
  body.set("key", apiKey);
  body.set("action", "upload");
  body.set("format", "json");
  body.set("source", new Blob([await file.arrayBuffer()], { type: TYPES[ext] }), name);
  let url;
  try {
    const res = await fetch(FREEIMAGE_API, { method: "POST", body, signal: AbortSignal.timeout(30_000) });
    const out = await res.json().catch(() => ({}));
    url = out?.image?.url;
    if (!res.ok || !url) throw new Error(out?.error?.message || out?.status_txt || `HTTP ${res.status}`);
  } catch (e) {
    console.error("freeimage.host upload failed", e);
    throw new AppError(`Image host upload failed: ${String(e?.message ?? e).slice(0, 150)}`, { status: 502, code: "UPSTREAM" });
  }
  if (!isStepFileUrl(url)) throw new AppError("Image host returned an unexpected URL", { status: 502, code: "UPSTREAM" });
  const id = uuid();
  await query(
    "INSERT INTO attachments (id, project_id, file_name, mime_type, size_bytes, storage_key, uploaded_by) VALUES (?,?,?,?,?,?,?)",
    [id, ctx.project.id, name, TYPES[ext], file.size, url, ctx.user.id],
  );
  return { id, name };
}

/** Hosted URL of the newest step image with this name in the project, or null. */
export async function findStepFileUrl(ctx, fileName) {
  const row = await queryOne(
    `SELECT storage_key FROM attachments WHERE project_id = ? AND file_name = ? AND execution_id IS NULL AND defect_id IS NULL AND test_case_id IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [ctx.project.id, fileName],
  );
  return row && isStepFileUrl(row.storage_key) ? row.storage_key : null;
}
