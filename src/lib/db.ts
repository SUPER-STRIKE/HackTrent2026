import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const db =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]*/, ""),
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = db;
