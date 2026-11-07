import { Pool } from "pg";
import { pgConfig } from "../../db/connection.mjs";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const pool = new Pool({ ...pgConfig(process.env.DATABASE_URL ?? ""), max: 5 });
  // Without a listener, an idle client dropped by the server crashes the process.
  pool.on("error", (err) => console.error("pg pool error", err.message));
  return pool;
}

export const db = globalForPg.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = db;
