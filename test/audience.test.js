const test = require('node:test'), assert = require('node:assert');
const A = require('../public/js/audience-core.js'), reg = require('../lib/digital/qatar-digital.json');
const pop = { year: '2024', groups: ['0', '1 - 4', '5 - 9', '10 - 14', '15 - 19', '20 - 24', '25 - 29', '30 - 34', '35 - 39', '40 - 44', '45 - 49', '50 - 54', '55 - 59', '60 - 64', '65 - 69', '70 - 74', '75 - 79', '80 +'],
  female: [10, 40, 50, 40, 30, 60, 100, 100, 80, 60, 40, 30, 20, 10, 5, 3, 2, 1], male: [10, 40, 50, 40, 40, 140, 300, 400, 330, 250, 150, 100, 60, 30, 10, 5, 3, 2] };

test('registry: every figure has a source, a date and a verbatim quotation, and gaps are stated rather than filled', () => {
  assert.ok(reg.facts.length >= 25); for (const f of reg.facts) { assert.ok(f.source && f.source.url && f.source.name && f.source.dataPeriod, f.id); assert.ok(f.quote && f.quote.length > 20, f.id); assert.ok(isFinite(f.value), f.id); }
  assert.equal(reg.facts.find(f => f.id === 'reach.snapchat').value, 1240000); assert.equal(reg.facts.find(f => f.id === 'sex.snapchat').male, 58);
  assert.ok(reg.facts.find(f => f.id === 'reach.facebook').quote.includes('2.40 million'));
  assert.ok(reg.notAvailable.some(n => /Age split of each platform/.test(n.what)) && reg.notAvailable.some(n => /Interest/.test(n.what)));
  assert.ok(!reg.facts.some(f => /age/i.test(f.metric) && f.platform), 'no per-platform age figure is invented');
});

test('age cells: exact on group edges, interpolated and flagged when a band cuts a group', () => {
  const c = A.ageCell(pop, 'all', 25, 34); assert.equal(c.size, 100 + 100 + 300 + 400); assert.equal(c.interpolated, false);
  assert.equal(A.ageCell(pop, 'female', 25, 34).size, 200); assert.equal(A.ageCell(pop, 'male', 25, 34).size, 700);
  const cut = A.ageCell(pop, 'all', 18, 24); assert.equal(cut.interpolated, true); assert.equal(cut.size, Math.round((30 + 40) * 2 / 5 + 60 + 140));
  assert.equal(A.adults(pop, 'all').size, A.ageCell(pop, 'all', 18, 120).size);
});

test('platform names map to registry keys', () => {
  assert.deepEqual(A.platformKeys('Meta (Facebook + Instagram)').sort(), ['facebook', 'instagram']); assert.deepEqual(A.platformKeys('Google Ads / YouTube'), ['youtube']); assert.deepEqual(A.platformKeys('Google Search'), [], 'Google Search has no published Qatar audience'); assert.deepEqual(A.platformKeys('X (Twitter)'), ['x']); assert.deepEqual(A.platformKeys('InMobi'), []);
  assert.deepEqual(A.platformKeys('TikTok'), ['tiktok']); assert.deepEqual(A.platformKeys('Snapchat'), ['snapchat']);
});

test('platform audience by sex uses the published share; segment sizes are flagged estimates unless a verified figure is entered', () => {
  const p = A.platform(reg, 'snapchat', 'female'); assert.equal(p.genderAudience, Math.round(1240000 * 0.412)); assert.equal(p.genderDerived, true); assert.equal(A.platform(reg, 'snapchat', 'all').genderAudience, 1240000); assert.equal(A.platform(reg, 'nonsense', 'all'), null);
  const seg = A.SEGMENTS.find(s => s.id === 'lifestyle-women'), s1 = A.segmentSizes(reg, pop, seg), r1 = s1.rows.find(r => r.platform === 'instagram');
  assert.equal(r1.verified, false); assert.ok(r1.assumption && r1.size <= r1.ceiling); assert.ok(r1.size > 0);
  const s2 = A.segmentSizes(reg, pop, seg, [{ platform: 'instagram', gender: 'female', ageFrom: 18, ageTo: 34, value: 99999, source: 'Meta Ads Manager', date: '2026-10-01' }]), r2 = s2.rows.find(r => r.platform === 'instagram');
  assert.equal(r2.verified, true); assert.equal(r2.exceedsPopulation, true, 'an entered figure above the population is flagged'); assert.equal(r2.size, 99999); assert.equal(r2.source, 'Meta Ads Manager'); assert.equal(s2.rows.find(r => r.platform === 'tiktok').verified, false);
});

test('plan against audience: frequency and the share reachable at frequency one come from the plan and the published audience only', () => {
  assert.deepEqual(A.planVsAudience(2480000, 1240000), { impressions: 2480000, audience: 1240000, frequencyIfAll: 2, maxReachShare: 0.5 });
  assert.equal(A.planVsAudience(100, 1000).maxReachShare, 1); assert.equal(A.planVsAudience(0, 1000), null); assert.equal(A.planVsAudience(5, 0), null);
});

test('reach for the brief target: ranked by verified audience, and platforms whose ad-tool figure exceeds the population are flagged', () => {
  const r = A.reachForTarget(reg, pop, { gender: 'male', ageFrom: 25, ageTo: 44 }); assert.equal(r.target.size, 700 + 580 ); assert.ok(r.rows.length >= 7);
  assert.ok(r.rows[0].genderAudience >= r.rows[1].genderAudience); const tt = r.rows.find(x => x.key === 'tiktok'); assert.equal(tt.exceedsAdults, true, 'TikTok reports more than the adult population in this fixture');
});
