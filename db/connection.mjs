/**
 * Shared pg connection options for the app (src/lib/db.ts) and scripts/migrate.mjs.
 * The sslmode query param is removed with URL parsing, because pg would otherwise
 * override the ssl option below. Set DATABASE_CA (PEM text) to verify the server certificate.
 */
export function pgConfig(url) {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  const ca = process.env.DATABASE_CA?.replace(/\\n/g, "\n");
  return {
    connectionString: u.toString(),
    ssl: ca ? { ca } : { rejectUnauthorized: false },
  };
}
