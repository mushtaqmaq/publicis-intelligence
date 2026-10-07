// Vercel function entry. vercel.json rewrites every /api/* and /files/* request here as
// /api/index?__p=<original path>, and this wrapper restores the original URL for the router.
const handler = require('../server.js');
module.exports = (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.searchParams.get('__p');
  if (p !== null) { u.searchParams.delete('__p'); req.url = '/api/' + p.replace(/^api\//, '') + u.search; }
  return handler(req, res);
};
