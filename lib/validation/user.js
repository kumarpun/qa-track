import { z } from "zod";
import { passwordSchema } from "./auth";

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  role: z.enum(["ADMIN", "QA_LEAD", "QA_ENGINEER", "VIEWER"]),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.enum(["ADMIN", "QA_LEAD", "QA_ENGINEER", "VIEWER"]),
  active: z.boolean(),
});
