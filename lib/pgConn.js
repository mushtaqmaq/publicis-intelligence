// pg treats sslmode=require/prefer/verify-ca as aliases for verify-full (and warns that pg v9 will change this).
// Spelling it out keeps today's behaviour exactly (full certificate verification) and silences the warning.
function withExplicitSsl(url) {
  if (!url || /[?&]uselibpqcompat=true/i.test(url)) return url;
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/i, '$1verify-full');
}
module.exports = { withExplicitSsl };
