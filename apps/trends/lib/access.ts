// Who may open Trends. The tab being visible is not permission, so every page asks the existing app, server to server, whether
// the caller's own session has Media access. This forwards only the caller's cookie to the app they are already signed in to and
// reads back their access list. It is a PROPOSED bridge that still needs a security review (docs/ADR-001), and it is not
// Supabase authentication: client-confidential data must wait for that (phase P2).
export type Access = { state: 'ok'; name: string; role: string } | { state: 'signed-out' } | { state: 'forbidden' } | { state: 'unverified'; reason: string };

export async function checkAccess(cookie: string | null, origin = process.env.LEGACY_ORIGIN, fetchImpl: typeof fetch = fetch): Promise<Access> {
  if (!origin) return { state: 'unverified', reason: 'This preview is not connected to Publicis Intelligence, so access could not be checked.' };
  if (!cookie) return { state: 'signed-out' };
  let r: Response;
  try { r = await fetchImpl(`${origin}/api/me`, { headers: { cookie }, cache: 'no-store', signal: AbortSignal.timeout(5000) }); }
  catch { return { state: 'unverified', reason: 'Publicis Intelligence could not be reached to check access.' }; }
  if (r.status === 401) return { state: 'signed-out' };
  if (!r.ok) return { state: 'unverified', reason: 'Publicis Intelligence could not confirm access.' };
  const me = (await r.json()) as { name?: string; email?: string; role?: string; access?: string[] | null };
  // access === null means unrestricted (the existing app's rule); otherwise any media/* tool grants the Media pillar.
  const media = me.access == null || (Array.isArray(me.access) && me.access.some(k => typeof k === 'string' && k.startsWith('media/')));
  return media ? { state: 'ok', name: me.name || me.email || 'Signed in', role: me.role || 'member' } : { state: 'forbidden' };
}
// Only a confirmed session may see content. An unverified check fails closed everywhere except local development.
export const mayView = (a: Access, env = process.env.NODE_ENV) => a.state === 'ok' || (a.state === 'unverified' && env !== 'production');
