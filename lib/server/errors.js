import "server-only";

export class AppError extends Error {
  constructor(message, { code = "BAD_REQUEST", status = 400, fieldErrors } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}
export const unauthorized = () => new AppError("You must sign in", { code: "UNAUTHORIZED", status: 401 });
export const forbidden = (m = "You do not have permission to do that") =>
  new AppError(m, { code: "FORBIDDEN", status: 403 });
// Same response for "missing" and "not yours" so project IDs cannot be probed.
export const notFound = (m = "Not found") => new AppError(m, { code: "NOT_FOUND", status: 404 });
