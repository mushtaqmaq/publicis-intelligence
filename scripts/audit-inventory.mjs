#!/usr/bin/env node
// READ-ONLY inventory audit. Usage:
//   DATABASE_URL=<postgres> node scripts/audit-inventory.mjs [--csv out.csv] [--sql retire.sql]
// It only runs SELECT queries. --sql writes a proposed "retire" script (reversible) for you to review and run yourself.
import fs from 'node:fs'; import pg from 'pg';
import { classifyAsset, safeToRetire, retireSql } from './auditInventoryLib.mjs';
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL (use a local copy or a Neon branch).'); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
try {
  await c.query('SET default_transaction_read_only = on');
  const { rows } = await c.query(`SELECT a.id, a."assetName", a."locationName", a.status, s.name AS supplier,
      (SELECT count(*) FROM asset_rates r WHERE r."assetId"=a.id AND r."publishedStatus"='PUBLISHED')::int AS "publishedRates",
      (SELECT count(*) FROM media_plan_items i WHERE i."assetId"=a.id)::int AS "planItems",
      count(*) OVER (PARTITION BY lower(a."assetName"), lower(a."locationName"), a."supplierId")::int AS dupes
    FROM assets a JOIN suppliers s ON s.id=a."supplierId" WHERE a.status='ACTIVE' ORDER BY s.name, a."assetName"`);
  const flagged = rows.map(r => ({ r, flags: classifyAsset(r) })).filter(x => x.flags.length);
  const by = l => flagged.filter(x => x.flags.some(f => f.level === l));
  const retire = flagged.filter(x => safeToRetire(x.r, x.flags));
  console.log(`Active assets checked: ${rows.length}`);
  console.log(`Clearly junk: ${by('junk').length} | needs review (duplicates / no rate): ${by('review').length} | informational: ${by('info').length}`);
  console.log(`Proposed to retire (junk and not used in any plan): ${retire.length}`);
  for (const x of by('junk').slice(0, 25)) console.log(`  [junk] ${x.r.supplier} | ${x.r.assetName} | ${x.r.locationName} | plan lines: ${x.r.planItems} | ${x.flags.filter(f => f.level === 'junk').map(f => f.code).join(',')}`);
  if (by('junk').length > 25) console.log(`  ... and ${by('junk').length - 25} more (see the CSV)`);
  const csv = arg('csv'); if (csv) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    fs.writeFileSync(csv, ['id,supplier,assetName,locationName,planItems,publishedRates,level,codes,reasons', ...flagged.map(x => [x.r.id, x.r.supplier, x.r.assetName, x.r.locationName, x.r.planItems, x.r.publishedRates, x.flags.some(f => f.level === 'junk') ? 'junk' : x.flags.some(f => f.level === 'review') ? 'review' : 'info', x.flags.map(f => f.code).join(' '), x.flags.map(f => f.why).join(' | ')].map(esc).join(','))].join('\n'));
    console.log(`CSV written: ${csv}`);
  }
  const sql = arg('sql'); if (sql) { fs.writeFileSync(sql, retireSql(retire.map(x => x.r.id))); console.log(`Proposed retire script written (NOT run): ${sql}`); }
} finally { await c.end(); }
