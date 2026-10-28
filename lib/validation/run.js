import { z } from "zod";

export const ENVIRONMENTS = ["DEVELOPMENT", "QA", "STAGING", "PRODUCTION"];
export const PLATFORMS = ["WEB", "ANDROID", "IOS", "API"];
export const RUN_STATUSES = ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const optText = (max) => z.string().trim().max(max).optional().default("");
const optDate = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Invalid date");

export const runSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(191),
    description: optText(5000),
    environment: z.enum(ENVIRONMENTS).default("QA"),
    buildVersion: optText(100),
    platform: z.enum(PLATFORMS).or(z.literal("")).optional().default(""),
    plannedStart: optDate,
    plannedEnd: optDate,
    testerIds: z.array(z.string().uuid()).max(100).default([]),
    suiteIds: z.array(z.string().uuid()).max(100).default([]),
    caseIds: z.array(z.string().uuid()).max(2000).default([]),
  })
  .refine((v) => v.suiteIds.length + v.caseIds.length > 0, {
    message: "Select at least one suite or test case",
    path: ["caseIds"],
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || Date.parse(v.plannedEnd) >= Date.parse(v.plannedStart), {
    message: "End must not be before start",
    path: ["plannedEnd"],
  });

export const runListSchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  status: z.enum(RUN_STATUSES).optional(),
  environment: z.enum(ENVIRONMENTS).optional(),
  build: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
});
