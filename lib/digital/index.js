// Verified Qatar digital facts (each with its source, date and quotation) plus official population by age and sex from Qatar Open Data.
// Nothing here is estimated: figures are copied from the cited pages and the registry says what is not available.
const { db } = require('../db');
const QA = require('../geo/qatar');
const reg = require('./qatar-digital.json');
const ctx = { db, fetchImpl: (u, i) => fetch(u, i) };

async function handle(req, res, user, p, h) {
  const { send, fail, accessOf } = h;
  const acc = await accessOf(user); if (acc && !acc.some(k => k.startsWith('media/'))) return fail(res, 403, 'You do not have access to this tool.');
  if (p === '/api/digital/qatar' && req.method === 'GET') return send(res, 200, { retrieved: reg.retrieved, facts: reg.facts, notAvailable: reg.notAvailable, population: await QA.agePopulation(ctx) });
  return fail(res, 404, 'Not found');
}
module.exports = { handle };
