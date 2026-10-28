import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(100),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "2-10 chars, letters/digits, start with a letter"),
  description: z.string().trim().max(2000).optional().default(""),
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  ownerId: z.string().uuid(),
});

export const memberSchema = z.object({
  userId: z.string().uuid("Select a user"),
  role: z.enum(["QA_LEAD", "QA_ENGINEER", "VIEWER"]),
});
