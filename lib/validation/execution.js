import { z } from "zod";

// NOT_RUN is the initial state only; a saved result is always one of these.
export const RESULT_STATUSES = ["PASSED", "FAILED", "BLOCKED", "SKIPPED", "RETEST"];
export const STEP_STATUSES = ["NOT_RUN", "PASSED", "FAILED", "BLOCKED", "SKIPPED"];

const optText = (max) => z.string().trim().max(max).optional().default("");

export const executionSchema = z
  .object({
    status: z.enum(RESULT_STATUSES, { error: "Choose a result" }),
    actualResult: optText(10000),
    comment: optText(5000),
    steps: z
      .array(
        z.object({
          position: z.number().int().min(1).max(1000),
          status: z.enum(STEP_STATUSES).default("NOT_RUN"),
          actualResult: optText(5000),
        }),
      )
      .max(200)
      .default([]),
    defectIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.status === "FAILED" && !v.actualResult) {
      ctx.addIssue({ code: "custom", path: ["actualResult"], message: "Actual result is required when a test fails" });
    }
    if (v.status === "PASSED" && v.steps.some((s) => s.status === "FAILED" || s.status === "BLOCKED")) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "A test with failed or blocked steps cannot be marked Passed" });
    }
  });

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(5000),
});

export const quickDefectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: optText(10000),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "TRIVIAL"]).default("MAJOR"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  externalUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Must be an http(s) URL"),
});

export const runStatusSchema = z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]);
