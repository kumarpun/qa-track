// Idempotent demo seed. Usage: node scripts/seed.mjs
// Demo password for all seeded users: Passw0rd!demo  (change/remove in real deployments)
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
  connectTimeout: 20000,
});

const PASSWORD = "Passw0rd!demo";
const hash = await bcrypt.hash(PASSWORD, 12);

const users = [
  ["admin@example.com", "Ada Admin", "ADMIN"],
  ["lead@example.com", "Liam Lead", "QA_LEAD"],
  ["qa1@example.com", "Quinn Engineer", "QA_ENGINEER"],
  ["qa2@example.com", "Riley Tester", "QA_ENGINEER"],
  ["viewer@example.com", "Vera Viewer", "VIEWER"],
];
const ids = {};
for (const [email, name, role] of users) {
  const [[row]] = await conn.query("SELECT id FROM users WHERE email = ?", [email]);
  if (row) { ids[email] = row.id; continue; }
  ids[email] = randomUUID();
  await conn.query("INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?,?)", [ids[email], email, name, hash, role]);
}

const projects = [
  ["APP", "Mobile App", "Customer-facing iOS/Android application", "lead@example.com",
    { "qa1@example.com": "QA_ENGINEER", "qa2@example.com": "QA_ENGINEER", "viewer@example.com": "VIEWER" }],
  ["WEB", "Web Portal", "Marketing site and customer self-service portal", "lead@example.com",
    { "qa1@example.com": "QA_ENGINEER" }],
];
for (const [key, name, description, owner, members] of projects) {
  const [[exists]] = await conn.query("SELECT id FROM projects WHERE `key` = ?", [key]);
  if (exists) continue;
  const pid = randomUUID();
  await conn.query("INSERT INTO projects (id, `key`, name, description, owner_id) VALUES (?,?,?,?,?)", [pid, key, name, description, ids[owner]]);
  const all = { [owner]: "QA_LEAD", ...members };
  for (const [email, role] of Object.entries(all))
    await conn.query("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?,?,?,?)", [randomUUID(), pid, ids[email], role]);
}

console.log(`seeded. Demo login: admin@example.com / ${PASSWORD}`);
await conn.end();
