export function pgConfig(url: string): { connectionString: string; ssl: { ca: string } | { rejectUnauthorized: boolean } };
