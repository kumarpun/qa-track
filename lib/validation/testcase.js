import { z } from "zod";

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const TYPES = ["FUNCTIONAL", "REGRESSION", "SMOKE", "INTEGRATION", "API", "UI", "PERFORMANCE", "SECURITY"];
export const AUTOMATION = ["MANUAL", "AUTOMATED", "TO_BE_AUTOMATED"];
export const CASE_STATUSES = ["PASSED", "FAILED", "BLOCKED", "NOT_EXECUTED", "IN_PROGRESS", "SKIPPED"];

const optText = (max) => z.string().trim().max(max).optional().default("");
const optUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Must be an http(s) URL")
  .optional()
  .default("");

export const stepSchema = z.object({
  action: z.string().trim().min(1, "Action is required").max(5000),
  testData: optText(5000),
  expected: z.string().trim().min(1, "Expected result is required").max(5000),
});

export const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20, "At most 20 tags")
  .default([])
  .transform((t) => [...new Set(t)]);

export const testCaseSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(255),
  description: optText(10000),
  preconditions: optText(5000),
  testData: optText(5000),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  type: z.enum(TYPES).default("FUNCTIONAL"),
  automation: z.enum(AUTOMATION).default("MANUAL"),
  component: optText(191),
  tags: tagsSchema,
  requirementUrl: optUrl,
  defectUrls: z.array(z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, "Must be an http(s) URL")).max(20).default([]),
  assigneeId: z.string().uuid().nullable().optional().default(null),
  steps: z.array(stepSchema).min(1, "Add at least one step").max(100),
});

export const SORT_COLUMNS = ["code", "title", "priority", "type", "updated_at", "created_at", "suite"];

export const listParamsSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  priority: z.enum(PRIORITIES).optional(),
  type: z.enum(TYPES).optional(),
  automation: z.enum(AUTOMATION).optional(),
  assignee: z.string().uuid().optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(SORT_COLUMNS).default("suite"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one test case").max(500),
  op: z.enum(["delete", "priority", "type", "automation", "assign"]),
  value: z.string().max(40).nullable().optional(),
});
