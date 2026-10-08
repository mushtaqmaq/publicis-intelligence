// Imports data from the original Hugging Face Space (SQLite) into the unified Postgres database.
// Pure planning (planImport) is separate from the database writes (applyImport) so it can be tested.
// Rules: never modify or overwrite an existing user, setting or document; skip, never merge, on conflict.

export const ALL_MODULES = ['strategy', 'creative', 'media', 'finance', 'production', 'search'];

/** rows: { users, ledger, docs, conversations, settings, files } straight from the Space's SQLite. */
export function planImport(rows, existing, opts = {}) {
  const modules = opts.modules ?? ALL_MODULES;
  const emailToExisting = new Map((existing.users || []).map(u => [String(u.email).toLowerCase(), u.id]));
  const usedIds = new Set((existing.users || []).map(u => u.id));
  const idMap = new Map();            // old user id -> id in the target (new or already existing)
  const newUsers = [], skippedUsers = [];
  for (const u of rows.users || []) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) { skippedUsers.push({ id: u.id, reason: 'no email' }); continue; }
    if (emailToExisting.has(email)) { idMap.set(u.id, emailToExisting.get(email)); skippedUsers.push({ email, reason: 'already exists (left untouched)' }); continue; }
    let id = String(u.id); if (usedIds.has(id)) id = id + '_sp';
    usedIds.add(id); idMap.set(u.id, id);
    newUsers.push({ id, email, name: String(u.name || ''), passwordHash: String(u.pass), role: u.role === 'admin' ? 'ADMIN' : 'PLANNER', credits: Number(u.credits) || 0, active: !!u.active, createdAt: Number(u.created_at) || Date.now(), modules: u.role === 'admin' ? [] : modules });
  }
  const imported = new Set(newUsers.map(u => u.id));
  const mapOwner = o => (o && idMap.has(o) ? idMap.get(o) : null);
  // Ledger only for users we created: an existing user's balance is not ours to rewrite.
  const ledger = (rows.ledger || []).filter(l => imported.has(idMap.get(l.user_id)));
  const docs = (rows.docs || []).map(d => ({ col: String(d.col), id: String(d.id), owner: mapOwner(d.owner), data: String(d.data), updatedAt: Number(d.updated_at) || Date.now() }));
  const conversations = (rows.conversations || []).filter(c => idMap.has(c.user_id)).map(c => ({ id: String(c.id), userId: idMap.get(c.user_id), title: String(c.title || ''), model: c.model ?? null, messages: String(c.messages || '[]'), updatedAt: Number(c.updated_at) || Date.now() }));
  const settings = (rows.settings || []).filter(s => !(existing.settingKeys || []).includes(s.key)).map(s => ({ key: String(s.key), value: String(s.value) }));
  const files = (rows.files || []).map(f => ({ id: String(f.id), owner: mapOwner(f.owner), name: f.name ?? null, mime: f.mime ?? null, size: f.size ?? null, kind: f.kind ?? null, createdAt: Number(f.created_at) || Date.now() }));
  return { newUsers, skippedUsers, ledger: ledger.map(l => ({ ...l, userId: idMap.get(l.user_id) })), docs, conversations, settings, files, idMap };
}

/** Writes the plan inside ONE transaction. fileBytes(id) returns the stored bytes or null. Safe to run twice. */
export async function applyImport(client, plan, fileBytes) {
  const out = { users: 0, grants: 0, ledger: 0, docs: 0, conversations: 0, settings: 0, files: 0, filesMissing: 0 };
  const ts = ms => new Date(ms).toISOString();
  await client.query('BEGIN');
  try {
    for (const u of plan.newUsers) {
      const r = await client.query(`INSERT INTO users(id,email,name,"passwordHash",role,credits,"isActive","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5::"UserRole",$6,$7,$8::timestamp,$8::timestamp) ON CONFLICT(email) DO NOTHING`, [u.id, u.email, u.name, u.passwordHash, u.role, u.credits, u.active, ts(u.createdAt)]);
      if (!r.rowCount) continue; out.users++;
      for (const m of u.modules) { const g = await client.query(`INSERT INTO user_permission_overrides(id,"userId","permissionId",granted) SELECT gen_random_uuid()::text,$1,p.id,true FROM permissions p WHERE p.key=$2 ON CONFLICT("userId","permissionId") DO NOTHING`, [u.id, 'module.' + m]); out.grants += g.rowCount; }
    }
    const created = new Set(plan.newUsers.map(u => u.id));
    for (const l of plan.ledger) { if (!created.has(l.userId)) continue; const r = await client.query(`INSERT INTO ledger(user_id,ts,kind,model,route,input_tokens,output_tokens,searches,usd,credits,balance_after,note,by_user) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 WHERE NOT EXISTS (SELECT 1 FROM ledger WHERE user_id=$1 AND ts=$2 AND kind=$3 AND credits=$10 AND balance_after=$11)`, [l.userId, l.ts, l.kind, l.model, l.route, l.input_tokens ?? 0, l.output_tokens ?? 0, l.searches ?? 0, l.usd ?? 0, l.credits, l.balance_after, l.note, l.by_user]); out.ledger += r.rowCount; }
    for (const d of plan.docs) { const r = await client.query(`INSERT INTO docs(col,id,owner,data,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(col,id) DO NOTHING`, [d.col, d.id, d.owner, d.data, d.updatedAt]); out.docs += r.rowCount; }
    for (const c of plan.conversations) { const r = await client.query(`INSERT INTO conversations(id,user_id,title,model,messages,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`, [c.id, c.userId, c.title, c.model, c.messages, c.updatedAt]); out.conversations += r.rowCount; }
    for (const s of plan.settings) { const r = await client.query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING`, [s.key, s.value]); out.settings += r.rowCount; }
    for (const f of plan.files) { const bytes = fileBytes(f.id); if (!bytes) { out.filesMissing++; continue; } const r = await client.query(`INSERT INTO files(id,owner,name,mime,size,kind,created_at,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`, [f.id, f.owner, f.name, f.mime, bytes.length, f.kind, f.createdAt, bytes]); out.files += r.rowCount; }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  return out;
}
