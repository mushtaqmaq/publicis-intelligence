const test = require('node:test'), assert = require('node:assert');
function load(me, last) {
  const store = last ? { 'pi.slogan': last } : {};
  global.PI = { S: { me }, lsGet: k => store[k] ?? null, lsSet: (k, v) => { store[k] = v; } };
  delete require.cache[require.resolve('../public/js/slogans.js')]; require('../public/js/slogans.js'); return { PI: global.PI, store };
}
test('slogans: a large library, no generic greeting, never the same twice in a row, personal to a single department', () => {
  const { PI } = load({ access: null });
  const all = [...PI.SLOGANS.GENERAL, ...Object.values(PI.SLOGANS.DEPT).flat()];
  assert.ok(PI.SLOGANS.GENERAL.length >= 40); assert.ok(!all.some(s => /good (morning|afternoon|evening)|welcome back|how can i help/i.test(s)), 'no boring greetings in the library');
  assert.ok(all.every(s => s.length < 100), 'short and punchy');
  const seen = new Set(); let prev = null;
  for (let i = 0; i < 300; i++) { const l = load({ access: null }, prev); const s = l.PI.slogan(); assert.notEqual(s, prev, 'not the same as last time'); assert.equal(l.PI.slogan(), s, 'stable within a visit'); assert.equal(l.store['pi.slogan'], s); seen.add(s); prev = s; }
  assert.ok(seen.size > 25, 'rotates through the library');
  assert.equal(load({ access: ['media/plan', 'media/geo'] }).PI.deptOf({ access: ['media/plan', 'media/geo'] }), 'media'); assert.equal(load({}).PI.deptOf({ access: ['media/plan', 'creative/image'] }), null); assert.equal(load({}).PI.deptOf({ access: null }), null);
  let dept = 0; for (let i = 0; i < 400; i++) if (load({ access: ['finance/fee'] }).PI.slogan() && PI.SLOGANS.DEPT.finance.includes(global.PI.slogan())) dept++;
  assert.ok(dept > 30, 'a finance-only user sees finance lines more often than chance');
});

test('agency brain: learns short terms and Qatar moments, keeps numbers and addresses out, only surfaces terms seen repeatedly', () => {
  const AB = require('../public/js/agency-brain-core.js'); let b = AB.emptyAgency();
  const brief = (i) => `Ramadan iftar activation for Karak House Doha. #KarakNights awareness among young professionals. Contact ali${i}@example.com budget QAR ${100000 + i}. Launch the Spicy Burger before Eid.`;
  for (let i = 0; i < 4; i++) b = AB.learn(b, brief(i), 'brief', ['Instagram', 'Snapchat']);
  assert.equal(b.docs, 4); const kt = AB.known(b, 40).map(x => x.term);
  assert.ok(kt.includes('#karaknights') && kt.includes('ramadan') && kt.includes('Karak House Doha') && kt.includes('Spicy Burger') && !kt.includes('example'), kt.join(','));
  assert.ok(!Object.keys(b.terms).some(t => /\d|@/.test(t)), 'no numbers, emails or addresses are stored'); assert.ok(!kt.includes('budget') && !kt.includes('brief'), 'common brief words are left out');
  assert.equal(b.seasons.ramadan, 4); assert.equal(b.seasons.eid, 4); assert.equal(b.platforms.Instagram, 4); assert.ok(b.objectives.awareness >= 4);
  const once = AB.learn(AB.emptyAgency(), 'Zebra Crossing campaign', 'chat'); assert.deepEqual(AB.known(once), [], 'one sighting is not a pattern');
  assert.equal(AB.digest(b), null, 'a digest needs enough material'); for (let i = 0; i < 3; i++) b = AB.learn(b, brief(10 + i) + ' Lusail Boulevard Pearl Island coffee lovers', 'brief');
  const d = AB.digest(b); assert.ok(d && d.terms.length >= 8 && d.moments.includes('ramadan')); assert.ok(AB.seeds(b).every(w => !/\s/.test(w)));
  for (let i = 0; i < 700; i++) b = AB.learn(b, 'uniqueterm' + String.fromCharCode(97 + i % 26) + String.fromCharCode(97 + (i / 26 | 0) % 26) + ' bravoword' + i, 'chat'); assert.ok(Object.keys(b.terms).length <= 600, 'memory stays bounded');
});
