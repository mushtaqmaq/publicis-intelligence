/* Home greetings: short, cheeky agency lines instead of "Good morning". One is picked per visit, never the same as last time,
   and weighted toward the person's own department when their access points to a single pillar. */
(function () {
'use strict';
const GENERAL = [
  "Make something they can't scroll past.", 'Boring called. We declined.', "Let's make the competition uncomfortable.", 'Another day, another chance to break the brief.', 'Less blah. More brilliant.', "Let's give the algorithm something to gossip about.", 'Your next big idea is one bad idea away.', 'Make it iconic. Or at least make it approved.', "We don't chase attention. We steal the spotlight.", 'Good ideas are cute. Great ideas get remembered.',
  'May your coffee be strong and your feedback be specific.', 'Somewhere, a client just asked to make the logo bigger.', "Today's forecast: 90% chance of urgent revisions.", "Creativity is free. The 17th revision isn't.", 'Keep calm. The deadline was yesterday.', "Welcome to another episode of 'Just One Small Change.'", 'Powered by caffeine, chaos, and client approvals.', "The brief is brief. The email thread isn't.", 'May all your final files actually be final.', "Another day of turning 'make it pop' into a strategy.",
  "Let's make boring jealous.", 'Seduce the audience. Not the algorithm.', "Be the campaign they secretly wish they'd made.", 'Play nice with people. Not with ideas.', 'Make some noise. Preferably on budget.', "Let's make that brand dangerously attractive.", 'Stop flirting with ideas. Make one happen.', "Great creative doesn't ask for attention. It demands it.", 'Your competitors are awake. How unfortunate for them.', "Let's create something worth a second look.",
  "Doha's awake. Time to make some noise.", 'Big ideas. Bigger karak energy. ☕', 'From the Pearl to the pitch room, make it memorable.', 'Hot takes. Hot deadlines. Hotter Doha summers.', 'Somewhere in West Bay, a deadline is approaching.', 'Keep the karak flowing and the ideas outrageous.',
  'The best campaigns started as a terrible idea someone was brave enough to say out loud.', 'If it needs a long explanation, it needs a better idea.', 'Be bold. The safe option is already taken by everyone else.', 'Today we make it simple, then make it unforgettable.'
];
const DEPT = {
  creative: ['Kill your darlings. Then sneak the best one back with a better font.', 'Make the work they pretend they did not want to like.', 'A blank page is just a deadline in disguise.', 'Great creative is 10% idea and 90% surviving the feedback.', 'Somewhere out there is a headline waiting to ruin your afternoon, beautifully.'],
  media: ['Budgets are finite. Clever is not.', 'Somewhere a CPM is quietly judging you.', 'Reach is vanity, frequency is sanity. Mostly.', 'Plan like the algorithm is listening. It is.', 'The best placement is the one they actually look at.'],
  strategy: ['An insight a day keeps the generic away.', 'Find the tension. Then find the budget for it.', 'Be the person who asks why before the first deck.', "The brief says 'everyone'. Your job is to find someone.", 'Truth first. Slides second. Coffee throughout.'],
  production: ['On time, on budget, on brand. Pick two, then fight for the third.', 'Every great shoot starts with a suspiciously calm call sheet.', 'Wrap early. Cheer quietly.', 'Somewhere a final file is named final_final_v7.'],
  finance: ['May every PO match and every invoice behave.', 'Numbers do not lie. They just wait for someone to ask nicely.', 'Reconcile now. Celebrate later.', 'Today: fewer surprises, more tidy columns.'],
  search: ['Rank like it is personal.', 'Somewhere a user is typing the question your client answers best.', 'Keywords are just people, abbreviated.']
};
PI.deptOf = me => { const a = me && me.access; if (!a || !a.length) return null; const p = [...new Set(a.map(k => k.split('/')[0]))]; return p.length === 1 && DEPT[p[0]] ? p[0] : null; };
// The library keeps growing: new lines written from the agency's own vocabulary are stored (team-wide) and mixed in with the seed lines.
const LIB = PI.sloganLib = { lines: [], hidden: [], lastRefresh: 0 }, AG = 'agencybrain', SL = 'sloganlib', WEEK = 7 * 864e5;
const BAD = /good (morning|afternoon|evening)|welcome back|how can i help|hello|^hi/i, norm = t => String(t).toLowerCase().replace(/[^\p{L}\d ]/gu, '').trim();
PI.slogan = (fresh) => {
  if (PI._slogan && !fresh) return PI._slogan;
  const dept = PI.deptOf(PI.S.me), mine = LIB.lines.filter(l => !l.dept || l.dept === dept).map(l => l.text), hide = new Set(LIB.hidden.map(norm));
  const pool = [...GENERAL, ...mine, ...(dept ? DEPT[dept].concat(DEPT[dept]) : [])].filter(t => !hide.has(norm(t))), last = fresh ? PI._slogan : PI.lsGet('pi.slogan'), ok = pool.filter(s => s !== last);
  const pick = ok[Math.floor(Math.random() * ok.length)]; PI.lsSet('pi.slogan', pick); return PI._slogan = pick;
};
PI.SLOGANS = { GENERAL, DEPT };

/* ---- the agency brain and the evolving library ---- */
PI.agency = null; let pending = [], timer = 0;
PI.loadAgency = async () => {
  try { PI.agency = Object.assign(PIAgency.emptyAgency(), await PI.api('GET', 'db/' + AG + '/main')); } catch (_) { PI.agency = PIAgency.emptyAgency(); }
  try { Object.assign(LIB, { lines: [], hidden: [], lastRefresh: 0 }, await PI.api('GET', 'db/' + SL + '/main')); } catch (_) { }
};
// Learning is batched: words and choices are collected and written together, merged into whatever the team has added since.
PI.learnAgency = (text, kind, platforms) => { pending.push([String(text || ''), kind, platforms || []]); clearTimeout(timer); timer = setTimeout(async () => {
  const batch = pending; pending = []; try { let b; try { b = Object.assign(PIAgency.emptyAgency(), await PI.api('GET', 'db/' + AG + '/main')); } catch (_) { b = PI.agency || PIAgency.emptyAgency(); } b.retired = LIB.hidden; for (const [t, k, p] of batch) b = PIAgency.learn(b, t, k, p); PI.agency = b; await PI.saveDoc(AG, 'main', b); } catch (_) { } }, 4000); };
// The agency's own words for prompts, once there is enough material to be worth it.
PI.agencyBlock = () => { const d = PI.agency && PIAgency.digest(PI.agency); return d ? `\n\nAGENCY VOCABULARY (words this agency really uses; use them only where natural and never invent facts with them): ${d.terms.join(', ')}.${d.moments.length ? ' Recurring moments: ' + d.moments.join(', ') + '.' : ''}` : ''; };
const saveLib = () => PI.saveDoc(SL, 'main', LIB).catch(() => { });
PI.retireSlogan = t => { if (!LIB.hidden.includes(t)) LIB.hidden.push(t); LIB.lines = LIB.lines.filter(l => l.text !== t); if (PI.agency) PI.agency.retired = LIB.hidden; saveLib(); };
PI.restoreSlogan = t => { LIB.hidden = LIB.hidden.filter(x => x !== t); saveLib(); };
// Ask for fresh lines at most once a week (or on demand), flavoured with the agency's own words. Lines are checked before they are kept.
PI.refreshSlogans = async force => {
  if (!force && Date.now() - LIB.lastRefresh < WEEK) return 0;
  LIB.lastRefresh = Date.now(); saveLib();
  const seeds = PIAgency.seeds(PI.agency || PIAgency.emptyAgency(), 8), have = new Set([...GENERAL, ...Object.values(DEPT).flat(), ...LIB.lines.map(l => l.text), ...LIB.hidden].map(norm));
  const r = await PI.ai({ tier: 'quick', route: 'agency/slogans', json: true, web: false, system: `You write one-line greetings for the home screen of an advertising agency platform in Doha. Witty, cheeky, confident, workplace-appropriate, about agency life, creativity, media, deadlines, coffee, Qatar. Each is under 70 characters, one sentence, at most one emoji, never a greeting such as good morning, hello, welcome back or how can I help. Do not repeat or lightly reword these examples: ${GENERAL.slice(0, 12).join(' | ')}. ${seeds.length ? 'You may play with these words the team really uses, only where it sounds natural: ' + seeds.join(', ') + '.' : ''} Return only JSON: [{"text":"","dept":"creative|media|strategy|production|finance|search|null"}] with 14 items, about 4 of them for departments.`, prompt: 'Write 14 new lines.' });
  let list; try { list = PI.parseJSON(r.text); } catch (_) { list = []; } if (!Array.isArray(list)) list = list.lines || [];
  const added = []; for (const x of list) { const t = String(x && x.text || '').trim(); if (t.length < 12 || t.length > 80 || BAD.test(t) || (t.match(/\p{Extended_Pictographic}/gu) || []).length > 1 || have.has(norm(t))) continue; have.add(norm(t)); added.push({ text: t, dept: DEPT[x.dept] ? x.dept : null, source: 'ai', at: Date.now() }); }
  LIB.lines = [...LIB.lines, ...added].slice(-150); await saveLib(); return added.length;
};
})();
