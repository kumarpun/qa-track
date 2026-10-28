import "server-only";
import { ZodError } from "zod";
import { AppError } from "./errors";

/**
 * Wrap a server action body: validates input with zod, maps errors to a serializable result.
 * Result: { ok: true, data } | { ok: false, error, fieldErrors? }
 */
export async function run(schema, input, fn) {
  try {
    const parsed = schema ? schema.parse(input) : input;
    return { ok: true, data: (await fn(parsed)) ?? null };
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors = {};
      for (const issue of e.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
      return { ok: false, error: "Please fix the highlighted fields", fieldErrors };
    }
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e?.code === "ER_DUP_ENTRY") return { ok: false, error: "A record with that value already exists" };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
