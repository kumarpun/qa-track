import "server-only";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";

export function poolConfig(overrides = {}) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    connectTimeout: 20000,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 300000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    waitForConnections: true,
    timezone: "Z",
    dateStrings: false,
    decimalNumbers: true,
    ...overrides,
  };
}

const g = globalThis;
export const pool = (g.__qaPool ??= mysql.createPool(poolConfig()));

// A new TLS connection to a remote database costs ~1.7 s versus ~100 ms for a query on a warm one. Open a few connections
// up front and ping them periodically so the pool does not drop to zero between clicks.
const WARM_CONNECTIONS = 3;
const warm = () => Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => pool.query("SELECT 1"))).catch(() => {});
if (process.env.DB_HOST && !g.__qaPoolWarm) {
  g.__qaPoolWarm = setInterval(warm, 30_000);
  g.__qaPoolWarm.unref?.();
  warm();
}

export const uuid = () => randomUUID();

/** Run a query; returns rows (SELECT) or the result header. */
export async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

export async function queryOne(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] ?? null;
}

/** Run fn(conn) inside a transaction; commits on success, rolls back on throw. */
export async function withTx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
