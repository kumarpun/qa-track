import { z } from "zod";

export const SEVERITIES = ["CRITICAL", "MAJOR", "MINOR", "TRIVIAL"];
export const DEFECT_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const DEFECT_STATUSES = ["OPEN", "IN_PROGRESS", "FIXED", "RETEST", "CLOSED", "REOPENED"];
export const OPEN_DEFECT_STATUSES = ["OPEN", "IN_PROGRESS", "REOPENED", "RETEST"];
export const DEFECT_ENVIRONMENTS = ["DEVELOPMENT", "QA", "STAGING", "PRODUCTION"];

const optText = (max) => z.string().trim().max(max).optional().default("");
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .default("")
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Must be an http(s) URL");

export const defectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: optText(10000),
  stepsToReproduce: optText(10000),
  expectedResult: optText(5000),
  actualResult: optText(5000),
  severity: z.enum(SEVERITIES).default("MAJOR"),
  priority: z.enum(DEFECT_PRIORITIES).default("MEDIUM"),
  environment: z.enum(DEFECT_ENVIRONMENTS).or(z.literal("")).optional().default(""),
  buildVersion: optText(100),
  externalUrl: httpUrl,
  assigneeId: z.string().uuid().or(z.literal("")).nullable().optional().default(""),
});

export const defectStatusSchema = z.enum(DEFECT_STATUSES);

export const defectListSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  status: z.enum(DEFECT_STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  priority: z.enum(DEFECT_PRIORITIES).optional(),
  assignee: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
});
