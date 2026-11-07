import { readFileSync } from "node:fs";
import pg from "pg";

try { process.loadEnvFile(".env.local"); } catch {}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set (.env.local)"); process.exit(1); }

const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
  .filter(Boolean);

const client = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl: { rejectUnauthorized: false } });
await client.connect();
for (const stmt of statements) {
  console.log("> " + stmt.split("\n")[0]);
  await client.query(stmt);
}
await client.end();
console.log("Schema applied.");
