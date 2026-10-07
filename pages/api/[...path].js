// The existing Publicis Intelligence API (server.js router) runs unchanged inside Next.js as a
// Pages-Router API route, which hands it plain Node req/res objects.
import handler from '../../server.js';

export const config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 300 };
export default handler;
