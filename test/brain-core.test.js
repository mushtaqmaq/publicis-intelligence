const test = require('node:test'), assert = require('node:assert');
const B = require('../public/js/brain-core.js');

const clients = [{ id: 'a', name: 'Ooredoo Qatar' }, { id: 'b', name: 'Qatar National Bank', aliases: ['QNB'] }, { id: 'c', name: 'McDonalds' }, { id: 'd', name: 'طلبات' }, { id: 'e', name: 'Talabat' }];

test('names are recognised however they are typed', () => {
  assert.equal(B.normName('The Ooredoo Qatar Q.P.S.C.'), 'ooredoo qatar');
  assert.equal(B.normName('  McDonald’s  L.L.C '), 'mcdonald s');
  assert.equal(B.recognise('OOREDOO QATAR LLC', clients).id, 'a');       // casing and legal suffix
  assert.equal(B.recognise('Mc Donalds', clients).id, 'c');              // spacing
  assert.equal(B.recognise('اوريدو', [{ id: 'x', name: 'أوريدو' }]).id, 'x'); // Arabic letter variants
  assert.equal(B.recognise('Vodafone', clients), null);                  // a different client is not recognised
  assert.equal(B.recognise('Talabt', clients), null);                    // a typo is a look-alike, not an automatic match
  assert.equal(B.lookalike('Talabt', clients).client.id, 'e');
  assert.equal(B.lookalike('Ooredoo', clients).client.id, 'a');          // shorter form of an existing name: ask first
});
test('suggestions while typing', () => {
  assert.deepEqual(B.matchClients('oo', clients).map(m => m.client.id), ['a']);
  assert.deepEqual(B.matchClients('qat', clients).map(m => m.client.id).sort(), ['a', 'b']);
  assert.equal(B.matchClients('QNB', clients)[0].client.id, 'b');         // alias and initials
  assert.equal(B.matchClients('q', clients).length, 0);                   // one letter suggests nothing
  assert.equal(B.matchClients('tal', clients)[0].client.id, 'e');
  assert.equal(B.matchClients('zzz', clients).length, 0);
  assert.equal(B.matchClients('', clients).length, 0);
});

test('tables become real figures, computed here', () => {
  const rows = [{ Channel: 'Meta', Spend: 1000, Clicks: 50, Date: '2026-01-01' }, { Channel: 'Meta', Spend: 500, Clicks: 20, Date: '2026-01-15' }, { Channel: 'TikTok', Spend: 300, Clicks: 9, Date: '2026-02-01' }];
  const t = B.describeRows('q1.xlsx', rows);
  assert.match(t, /3 rows, 4 columns/); assert.match(t, /Spend: numeric, total 1,800/); assert.match(t, /Clicks: numeric, total 79/);
  assert.match(t, /Channel: 2 distinct.*Meta \(2\)/); assert.match(t, /dates from 2026-01-01 to 2026-02-01/);
  assert.match(B.sourceText({ name: 'f.csv', rows, text: 'ignored' }), /Sample rows:/);
  assert.equal(B.sourceText({ name: 'n.txt', text: 'plain text' }), 'plain text');
});
test('long material is split on line breaks and flagged when cut', () => {
  const t = Array.from({ length: 100 }, (_, i) => 'line ' + i).join('\n');
  const r = B.chunkText(t, 200, 3);
  assert.equal(r.chunks.length, 3); assert.ok(r.truncated); assert.ok(r.chunks.every(c => c.length <= 200));
  assert.equal(B.chunkText('short', 200, 3).truncated, false);
});

const src = (id, name = 'brief.docx') => ({ id, name, kind: 'file', chars: 1000 });
test('what is learned is merged: no duplicates, profile replaced, questions replaced, sources tracked', () => {
  let b = B.emptyBrain();
  b = B.mergeBrain(b, { profile: { overview: 'Retail bank in Qatar.', audience: 'Affluent nationals 25-45' }, facts: [{ topic: 'goals', text: 'Goal: 20% more card applications in Q4 2026', confidence: 'high' }, { topic: 'channels', text: 'Meta and YouTube are the main paid channels', confidence: 'medium' }], questions: ['What is the Q4 budget?'] }, src('s1'), 1000);
  assert.equal(b.facts.length, 2); assert.equal(b.sources.length, 1); assert.equal(b.version, 1); assert.equal(b.lastAdded, 2);
  b = B.mergeBrain(b, { profile: { audience: 'Affluent nationals and expats, 25-45' }, facts: [{ topic: 'goals', text: 'Goal: 20% more card applications in Q4 2026', confidence: 'high' }, { topic: 'goals', text: 'Goal: 20 percent more card applications in Q4 2026.' }, { topic: 'budget', text: 'Q4 budget is QAR 400,000', confidence: 'high' }], questions: [] }, src('s2', 'plan.pdf'), 2000);
  assert.equal(b.facts.length, 3, 'exact and near-duplicate facts are not stored twice'); assert.equal(b.lastAdded, 1);
  assert.equal(b.profile.overview, 'Retail bank in Qatar.'); assert.equal(b.profile.audience, 'Affluent nationals and expats, 25-45');
  assert.deepEqual(b.questions, []); assert.equal(b.sources.length, 2); assert.equal(b.version, 2);
});
test('bad model output cannot damage the brain', () => {
  let b = B.mergeBrain(B.emptyBrain(), { facts: [{ text: 'ok' }, { text: 'x'.repeat(2000), topic: 'nonsense', confidence: 'certain' }, null, { topic: 'goals' }], profile: { overview: 'y'.repeat(5000), unknown: 'ignored' } }, src('s1'));
  assert.equal(b.facts.length, 1); assert.equal(b.facts[0].topic, 'other'); assert.equal(b.facts[0].confidence, 'medium'); assert.ok(b.facts[0].text.length <= 260);
  assert.ok(b.profile.overview.length <= 1500); assert.ok(!('unknown' in b.profile));
  assert.doesNotThrow(() => B.mergeBrain(b, null, src('s2')));
});
test('the brain is capped, keeping the strongest and newest facts', () => {
  let b = B.emptyBrain();
  for (let i = 0; i < 6; i++) b = B.mergeBrain(b, { facts: Array.from({ length: 100 }, (_, j) => ({ topic: 'other', text: `unique fact number ${i}-${j} alpha${i}${j} beta${j}${i}`, confidence: j === 0 ? 'high' : 'low' })) }, src('s' + i), 1000 + i);
  assert.equal(b.facts.length, 500);
  assert.equal(b.facts.filter(f => f.confidence === 'high').length, 6);
});
test('removing a source removes what it taught', () => {
  let b = B.mergeBrain(B.emptyBrain(), { facts: [{ text: 'Fact from the first source here' }] }, src('s1'));
  b = B.mergeBrain(b, { facts: [{ text: 'Fact from the second source here' }] }, src('s2'));
  const r = B.removeSource(b, 's1');
  assert.equal(r.facts.length, 1); assert.equal(r.sources.length, 1); assert.ok(r.stale);
  assert.equal(B.removeFact(r, r.facts[0].id).facts.length, 0);
});
test('the digest is what agents read: bounded, ordered, names its sources', () => {
  assert.equal(B.digest(B.emptyBrain()), ''); assert.equal(B.digest(null), '');
  let b = B.mergeBrain(B.emptyBrain(), { profile: { overview: 'A bank.' }, facts: [{ topic: 'goals', text: 'Low confidence thing happened', confidence: 'low' }, { topic: 'goals', text: 'High confidence goal for Q4', confidence: 'high' }], questions: ['Budget?'] }, src('s1', 'brief.docx'));
  const d = B.digest(b);
  assert.match(d, /^Client brain \(learned from 1 source;/); assert.match(d, /Overview: A bank\./);
  assert.ok(d.indexOf('High confidence') < d.indexOf('Low confidence')); assert.match(d, /\(unconfirmed\)/); assert.match(d, /\[brief\.docx\]/); assert.match(d, /Still unknown: Budget\?/);
  for (let i = 0; i < 300; i++) b = B.mergeBrain(b, { facts: [{ text: `Distinct fact ${i} about ${'word'.repeat(i % 7)} number${i}` }] }, src('t' + i));
  assert.ok(B.digest(b, 3000).length <= 3100, 'stays within the budget');
});
test('the strength meter grows with what is known and never passes 100', () => {
  assert.equal(B.strength(B.emptyBrain()), 0);
  let b = B.mergeBrain(B.emptyBrain(), { facts: [{ text: 'First useful fact here' }] }, src('s1')); const s1 = B.strength(b); assert.ok(s1 > 0);
  for (let i = 0; i < 80; i++) b = B.mergeBrain(b, { profile: { overview: 'x' }, facts: [{ text: `Another distinct fact number ${i} zeta${i}${i}` }] }, src('t' + i));
  assert.ok(B.strength(b) > s1 && B.strength(b) <= 100);
});
test('model answers are read leniently and chunks fold together', () => {
  assert.deepEqual(B.parseDelta('```json\n{"facts":[{"text":"a b c d e f g h"}],"note":"x {y}"}\n```').facts.length, 1);
  assert.deepEqual(B.parseDelta('Sure! {"profile":{"overview":"o"}} hope that helps').profile, { overview: 'o' });
  assert.throws(() => B.parseDelta('no json here')); assert.throws(() => B.parseDelta('{"unfinished": '));
  const f = B.foldDeltas([{ profile: { overview: 'one' }, facts: [{ text: 'a' }], questions: ['q1'] }, { profile: { audience: 'two' }, facts: [{ text: 'b' }], questions: ['q2'], note: 'n' }]);
  assert.equal(f.facts.length, 2); assert.deepEqual(f.profile, { overview: 'one', audience: 'two' }); assert.deepEqual(f.questions, ['q2']); assert.equal(f.note, 'n');
  const p = B.brainPrompt({ name: 'QNB', industry: 'Banking' }, B.emptyBrain(), 'text', { name: 'f', kind: 'file' });
  assert.match(p.system, /BRAIN_TASK/); assert.match(p.system, /QNB \(Banking\)/); assert.match(p.user, /New material: "f"/);
});
