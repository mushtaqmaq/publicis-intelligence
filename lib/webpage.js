// Fetches a public web page and extracts SEO signals for the SEO audit agent.
const dns = require('dns').promises, net = require('net');

function privateIp(ip) {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.'); }
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
async function safeUrl(u) {
  let url; try { url = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); } catch (_) { throw new Error('That is not a valid web address.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https pages can be audited.');
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('That website could not be found.');
  if (addrs.some(a => privateIp(a.address))) throw new Error('That address points to a private network and cannot be audited.');
  return url;
}
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag); return m ? (m[2] ?? m[3] ?? '') : ''; };

async function audit(input) {
  let url = await safeUrl(input), r, hops = 0;
  const t0 = Date.now();
  for (;;) {
    r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; PublicisIntelligence-SEO/1.0)', accept: 'text/html,*/*' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location') && hops < 5) { url = await safeUrl(new URL(r.headers.get('location'), url).href); hops++; continue; }
    break;
  }
  const ms = Date.now() - t0;
  const reader = r.body.getReader(); let size = 0; const chunks = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 3e6) break; chunks.push(value); }
  const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
  const head = (/<head[\s\S]*?<\/head>/i.exec(html) || [html])[0];
  const metas = head.match(/<meta\b[^>]*>/gi) || [];
  const meta = n => { const t = metas.find(m => new RegExp('(name|property)\\s*=\\s*["\']' + n + '["\']', 'i').test(m)); return t ? attr(t, 'content') : ''; };
  const links = head.match(/<link\b[^>]*>/gi) || [];
  const hx = lvl => (html.match(new RegExp('<h' + lvl + '\\b[^>]*>[\\s\\S]*?<\\/h' + lvl + '>', 'gi')) || []).map(strip).filter(Boolean);
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const anchors = (html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi) || []).map(a => attr(a, 'href'));
  const host = url.hostname.replace(/^www\./, '');
  const internal = anchors.filter(h => h.startsWith('/') || h.includes(host)).length;
  const schema = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m => { try { const j = JSON.parse(m[1]); return [].concat(j['@graph'] || j).map(x => x['@type']).flat(); } catch (_) { return ['(invalid JSON-LD)']; } }).filter(Boolean);
  const body = strip(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' '));
  const htmlTag = (/<html\b[^>]*>/i.exec(html) || [''])[0];
  return {
    url: url.href, status: r.status, response_ms: ms, size_kb: Math.round(size / 1024), redirects: hops,
    https: url.protocol === 'https:', lang: attr(htmlTag, 'lang'), dir: attr(htmlTag, 'dir'),
    title: strip((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [])[1]), meta_description: meta('description'),
    robots: meta('robots'), canonical: attr(links.find(l => /rel\s*=\s*["']canonical/i.test(l)) || '', 'href'),
    hreflang: links.filter(l => /hreflang/i.test(l)).map(l => attr(l, 'hreflang')), viewport: meta('viewport'),
    og_title: meta('og:title'), og_image: meta('og:image'),
    h1: hx(1).slice(0, 5), h2: hx(2).slice(0, 15), h3_count: hx(3).length,
    images: imgs.length, images_missing_alt: imgs.filter(i => !/\balt\s*=\s*["'][^"']+["']/i.test(i)).length,
    links_internal: internal, links_external: anchors.length - internal, schema_types: [...new Set(schema)],
    word_count: body.split(' ').filter(Boolean).length, text_excerpt: body.slice(0, 6000)
  };
}
module.exports = { audit };
