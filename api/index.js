// Vercel entry point: the original Node router (server.js) runs unchanged behind this one function.
// vercel.json rewrites /api/* and /files/* here; everything else is the static site in public/.
module.exports = require('../server.js');
module.exports.config = { api: { bodyParser: false } };
