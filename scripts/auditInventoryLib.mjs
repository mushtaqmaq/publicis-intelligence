// Flags inventory rows that look like rate-card parsing artifacts. Pure classification; the CLI only reads the database.
// Whole-name matches only: real print placements start with words like "Page", so prefixes are never enough.
const HEADER_NAME = /^(technical details|technical specifications?|specifications?|specs|terms( and|\s*&)? conditions|rate\s*card|contact( details)?|disclaimer|appendix|annex|remarks?|notes?)[\s*:.]*$/i;

/** row: { assetName, locationName, supplier, publishedRates, planItems, dupes } -> [{ code, level, why }] */
export function classifyAsset(row) {
  const out = []; const name = String(row.assetName || '').trim(); const loc = String(row.locationName || '').trim();
  if (/\*\*/.test(name) || /\*\*/.test(loc)) out.push({ code: 'asterisks', level: 'junk', why: 'Name or location contains "**" (a footnote marker from a rate-card PDF)' });
  if (HEADER_NAME.test(name)) out.push({ code: 'section-header', level: 'junk', why: `Name is a document section heading ("${name.slice(0, 30)}")` });
  // Short or number-only names are often real (a size such as "13M" or "10m(W) x 12m(H)"): review, never auto-junk.
  if (name.length < 3) out.push({ code: 'too-short', level: 'review', why: 'Name is shorter than 3 characters' });
  else if (!/[A-Za-z؀-ۿ]{3}/.test(name)) out.push({ code: 'no-words', level: 'review', why: 'Name has no word (only digits, units or symbols); may be a size used as a name' });
  if ((row.dupes || 1) > 1) out.push({ code: 'duplicate', level: 'review', why: `${row.dupes} rows share the same name, location and supplier` });
  if (!(row.publishedRates > 0)) out.push({ code: 'no-rate', level: 'review', why: 'No published rate' });
  if (name && loc && name.toLowerCase() === loc.toLowerCase() && !out.some(o => o.level === 'junk')) out.push({ code: 'name-is-location', level: 'info', why: 'Name equals location (often legitimate)' });
  return out;
}

/** Only unused, clearly-junk rows are proposed for retirement; anything in a plan is never touched. */
export const safeToRetire = (row, flags) => flags.some(f => f.level === 'junk') && !(row.planItems > 0);

export function retireSql(ids) {
  if (!ids.length) return '-- Nothing to retire.\n';
  const list = ids.map(i => `'${String(i).replace(/'/g, "''")}'`).join(',\n  ');
  return `-- Review every row first. Retiring is reversible: set status back to 'ACTIVE'.\nBEGIN;\nUPDATE assets SET status = 'RETIRED', "updatedAt" = (now() AT TIME ZONE 'UTC') WHERE status = 'ACTIVE' AND id IN (\n  ${list}\n);\nCOMMIT;\n`;
}
