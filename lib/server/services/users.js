import "server-only";
import { query, queryOne, uuid } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";
import { hashPassword } from "./auth";

export const listUsers = () =>
  query("SELECT id, name, email, role, active, created_at FROM users ORDER BY name");

export const listActiveUsers = () =>
  query("SELECT id, name, email, role FROM users WHERE active = 1 ORDER BY name");

export async function createUser(actor, input) {
  const id = uuid();
  try {
    await query("INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?,?)", [
      id, input.email, input.name, await hashPassword(input.password), input.role,
    ]);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") throw new AppError("Email already registered", { fieldErrors: { email: "Already registered" } });
    throw e;
  }
  await audit({ userId: actor.id, action: "user.created", entityType: "user", entityId: id, metadata: { email: input.email, role: input.role } });
  return { id };
}

export async function updateUser(actor, id, input) {
  if (id === actor.id && (!input.active || input.role !== "ADMIN"))
    throw new AppError("You cannot deactivate or demote yourself");
  const res = await query("UPDATE users SET name=?, role=?, active=? WHERE id=?", [input.name, input.role, input.active ? 1 : 0, id]);
  if (!res.affectedRows) throw new AppError("User not found", { status: 404 });
  await audit({ userId: actor.id, action: "user.updated", entityType: "user", entityId: id, metadata: input });
}

export const updateProfile = async (userId, name) => {
  await query("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
  await audit({ userId, action: "user.profile_updated", entityType: "user", entityId: userId });
};
