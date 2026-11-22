// Server-only connection to the Trends database (Supabase Postgres). Used by ingestion and server-rendered reads.
// This is the privileged connection: it bypasses row-level security, so it must never be reachable from the browser
// and every query here must scope by organisation itself.
import { Pool } from 'pg';

let pool: Pool | null = null;
// The ssl option below decides encryption; a sslmode in the address would override it, so it is dropped (and only it).
export const withoutSslMode = (url: string) => { const u = new URL(url); u.searchParams.delete('sslmode'); return u.toString(); };
export const dbConfigured = () => !!(process.env.TRENDS_DATABASE_URL || process.env.POSTGRES_URL);
export function db(): Pool {
  const url = process.env.TRENDS_DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('The Trends database is not configured.');
  // shortcut: Supabase's pooler presents a certificate chain node does not trust by default; the connection is still encrypted. Pin the CA if this ever carries client-confidential data.
  return (pool ??= new Pool({ connectionString: withoutSslMode(url), max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } }));
}
