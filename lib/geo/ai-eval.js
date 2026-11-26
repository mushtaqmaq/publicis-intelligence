// A fixed set of briefs with the reading a planner would expect. Run by an admin after changing the model or the prompt, to see
// whether brief reading got better or worse. It calls the AI for each brief (fresh: no cache, no past corrections), so it costs tokens.
// The rule reader is scored on the same set for free, as a baseline.
const B = require('./brain'), GT = require('./gtm');
const CASES = [
  { text: 'QNB premium credit cards for office professionals', audiences: ['office_professionals'], objective: 'banking', industry: 'retail_banking' },
  { text: 'Family entertainment centre launch in Qatar for weekends', audiences: ['families'], objective: 'entertainment' },
  { text: 'Reach tourists shopping for luxury watches during the holiday season', audiences: ['tourists'], objective: 'luxury_retail' },
  { text: 'Weekday lunch offer for office workers from a burger chain', audiences: ['office_professionals'], objective: 'lunch', industry: 'qsr' },
  { text: 'Recruit nurses and doctors for a private hospital', audiences: ['healthcare_professionals'], objective: 'recruitment', industry: 'hospital' },
  { text: 'We are a supermarket chain: where should we open a new branch?', audiences: ['shoppers'], objective: 'branch_expansion', industry: 'grocery' },
  { text: 'حملة لبطاقات ائتمانية مميزة لموظفي المكاتب في الدوحة', audiences: ['office_professionals'], objective: 'banking' },
  { text: 'Car servicing and maintenance offer for car owners', audiences: ['automotive'], objective: 'automotive_service' }
];
const judge = (c, got) => { const miss = []; if (!c.audiences.every(a => (got.audiences || []).includes(a))) miss.push('audience'); if (got.objective !== c.objective) miss.push('objective'); if (c.industry && got.industry_id !== c.industry) miss.push('industry'); return miss; };
const baseline = () => CASES.map(c => { const b = GT.readBrief(c.text); return { text: c.text, missed: judge(c, b) }; });

async function run(ctx, { user }) {
  const C = ctx.brainConfig || B.config(), rules = baseline(), out = []; let tokens = 0;
  if (!C.enabled) return { enabled: false, why: C.why, rules: { passed: rules.filter(r => !r.missed.length).length, total: rules.length, cases: rules } };
  for (const c of CASES) {
    try { const r = await B.enhance({ ...ctx, aiCalls: -100 }, { user, analysisId: 'eval', text: c.text, known: {}, fresh: true }), b = GT.mergeAi(GT.readBrief(c.text), r.plan); tokens += r.ai.input + r.ai.output;
      out.push({ text: c.text, missed: judge(c, b), got: { audiences: b.audiences, objective: b.objective, industry_id: b.industry_id } }); }
    catch (e) { out.push({ text: c.text, missed: ['error: ' + (e.code || 'failed')] }); if (e.code === 'ai-budget') break; }
  }
  return { enabled: true, model: C.planner, promptVersion: B.PROMPT_VERSION, tokens, ai: { passed: out.filter(r => !r.missed.length).length, total: out.length, cases: out }, rules: { passed: rules.filter(r => !r.missed.length).length, total: rules.length, cases: rules } };
}
module.exports = { run, baseline, CASES, judge };
