import { z } from "zod";
import { TYPES } from "./testcase";

const optText = (max) => z.string().trim().max(max).optional().default("");

export const suiteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(191),
  description: optText(5000),
  feature: optText(191),
  type: z.enum(TYPES).or(z.literal("")).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  parentId: z.string().uuid().nullable().optional().default(null),
});

export const idList = z.array(z.string().uuid()).min(1, "Select at least one test case").max(500);
