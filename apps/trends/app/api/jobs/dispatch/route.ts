// Scheduler entry point: runs the sources that are due, a few per call. Only a caller with the shared secret may trigger it.
import { timingSafeEqual } from 'node:crypto';
import { db, dbConfigured } from '@/lib/db';
import { dueSources, runSource } from '@/lib/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, given = req.headers.get('authorization') ?? '';
  if (!secret || !same(given, `Bearer ${secret}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 });   // no secret configured means nobody may run it
  if (!dbConfigured()) return Response.json({ error: 'The Trends database is not configured.' }, { status: 503 });
  try {
    const pool = db(), results = [];
    for (const s of await dueSources(pool)) results.push(await runSource(pool, s));
    return Response.json({ ran: results.length, results });
  } catch (e) { console.error('dispatch failed:', e instanceof Error ? e.message : 'unknown'); return Response.json({ error: 'The run could not start.' }, { status: 500 }); }   // the detail goes to the server log, never to the caller
}
