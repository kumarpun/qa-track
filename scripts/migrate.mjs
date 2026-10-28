// Applies db/migrations/*.sql in order, tracking applied files in _migrations.
// Usage: node scripts/migrate.mjs   (creates the database if missing)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const dir = path.resolve("db/migrations");
const base = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
  connectTimeout: 20000,
};
const dbName = process.env.DB_NAME;
if (!dbName || !/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error("DB_NAME missing or invalid");

const admin = await mysql.createConnection(base);
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
await admin.end();

const conn = await mysql.createConnection({ ...base, database: dbName });
await conn.query(`CREATE TABLE IF NOT EXISTS _migrations (
  name VARCHAR(191) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`);
const [done] = await conn.query("SELECT name FROM _migrations");
const applied = new Set(done.map((r) => r.name));

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) continue;
  const sql = fs.readFileSync(path.join(dir, file), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const statements = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  console.log(`> ${file} (${statements.length} statements)`);
  for (const s of statements) await conn.query(s);
  await conn.query("INSERT INTO _migrations (name) VALUES (?)", [file]);
}
console.log("migrations up to date");
await conn.end();
