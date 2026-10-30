import "server-only";
import { query, queryOne, uuid } from "../db";
import { AppError } from "../errors";
import { hashPassword } from "./auth";

export const listUsers = (orgId) =>
  query("SELECT id, name, email, role, active, created_at FROM users WHERE org_id = ? ORDER BY name", [orgId]);

export const listActiveUsers = (orgId) =>
  query("SELECT id, name, email, role FROM users WHERE org_id = ? AND active = 1 ORDER BY name", [orgId]);

export async function createUser(actor, input) {
  const id = uuid();
  try {
    await query("INSERT INTO users (id, org_id, email, name, password_hash, role) VALUES (?,?,?,?,?,?)", [
      id, actor.org_id, input.email, input.name, await hashPassword(input.password), input.role,
    ]);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") throw new AppError("Email already registered", { fieldErrors: { email: "Already registered" } });
    throw e;
  }
  return { id };
}

export async function updateUser(actor, id, input) {
  if (id === actor.id && (!input.active || input.role !== "ADMIN"))
    throw new AppError("You cannot deactivate or demote yourself");
  const res = await query("UPDATE users SET name=?, role=?, active=? WHERE id=? AND org_id=?", [input.name, input.role, input.active ? 1 : 0, id, actor.org_id]);
  if (!res.affectedRows) throw new AppError("User not found", { status: 404 });
}

export const updateProfile = async (userId, name) => {
  await query("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
};
