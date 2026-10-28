import "server-only";
import bcrypt from "bcryptjs";
import { queryOne, query, uuid } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";

// Constant-ish time: always run a bcrypt compare, even for unknown emails.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const hashPassword = (pw) => bcrypt.hash(pw, 12);

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

// Counted per submitted email (known or not) so lockout cannot be used to probe which accounts exist.
async function recentFailures(email) {
  const row = await queryOne(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND created_at > (NOW(3) - INTERVAL ? MINUTE)",
    [email, LOCKOUT_MINUTES],
  );
  return Number(row.n);
}

export async function authenticate(email, password) {
  if ((await recentFailures(email)) >= MAX_FAILED_LOGINS) {
    await audit({ action: "auth.login_locked", entityType: "user", metadata: { email } });
    throw new AppError(`Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`, { code: "RATE_LIMITED", status: 429 });
  }
  const user = await queryOne("SELECT id, password_hash, active FROM users WHERE email = ?", [email]);
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    await query("INSERT INTO login_attempts (id, email) VALUES (?, ?)", [uuid(), email]);
    await audit({ action: "auth.login_failed", entityType: "user", metadata: { email } });
    throw new AppError("Invalid email or password", { code: "UNAUTHORIZED", status: 401 });
  }
  await query("DELETE FROM login_attempts WHERE email = ?", [email]);
  await audit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
  return user.id;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await queryOne("SELECT password_hash FROM users WHERE id = ?", [userId]);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash)))
    throw new AppError("Current password is incorrect", { fieldErrors: { currentPassword: "Incorrect password" } });
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(newPassword), userId]);
  await audit({ userId, action: "user.password_changed", entityType: "user", entityId: userId });
}
