import "server-only";
import { AppError } from "./errors";

/** Route-handler error mapping: AppErrors keep their status, everything else is a generic 500. */
export function errorResponse(e) {
  if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
