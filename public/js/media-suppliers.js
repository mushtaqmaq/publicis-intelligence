/* Platforms and third-party suppliers the planner can consider, and a transparent rule for which ones a brief calls for.
   This is a planning directory, not a list of confirmed Qatar inventory or rates: every supplier must be confirmed before a plan is sent.
   Relevance is counted from what the brief asks for, never from invented audience facts. */
(function () {
'use strict';
const P = (id, name, type, tags, formats, buying, note) => ({ id, name, kind: 'platform', type, tags, formats, buying, note });
const T = (id, name, type, tags, formats, buying, note) => ({ id, name, kind: 'third-party', type, tags, formats, buying, note });
PI.SUPPLIERS = [
  P('meta', 'Meta (Facebook, Instagram, Messenger)', 'Social', ['reach', 'video', 'traffic', 'leads', 'conversions', 'app', 'retarget'], 'Feed, Stories, Reels, lead forms', 'CPM, CPC, CPL, CPV', 'Self-serve ad accounts; verified Qatar reach and gender in the registry.'),
  P('youtube', 'YouTube (Google Ads)', 'Video', ['reach', 'video', 'traffic', 'conversions', 'retarget'], 'Skippable, bumper, Shorts, masthead', 'CPM, CPV, CPCV', 'Verified Qatar reach and gender in the registry.'),
  P('google-search', 'Google Search', 'Search', ['search', 'leads', 'conversions', 'traffic', 'retarget'], 'Search text ads, Performance Max', 'CPC, CPA', 'Captures existing intent; reach depends on search demand, not on a published audience.'),
  P('google-display', 'Google Display and Demand Gen', 'Display', ['reach', 'traffic', 'retarget', 'conversions'], 'Responsive display, Demand Gen', 'CPM, CPC', 'Broad network reach across publishers and apps.'),
  P('tiktok', 'TikTok', 'Social video', ['reach', 'video', 'traffic', 'app', 'conversions'], 'In-feed, TopView, Spark Ads', 'CPM, CPV, CPC', 'Verified Qatar reach (18+) and gender in the registry.'),
  P('snapchat', 'Snapchat', 'Social', ['reach', 'video', 'traffic', 'app', 'conversions', 'local'], 'Snap Ads, Story Ads, Lenses', 'CPM, CPV, CPSU', 'Verified Qatar reach and gender in the registry.'),
  P('linkedin', 'LinkedIn', 'Professional social', ['b2b', 'leads', 'traffic', 'reach', 'native'], 'Sponsored content, message ads, lead gen forms', 'CPM, CPC, CPL', 'Verified Qatar member reach (18+) and gender in the registry; targets by job and industry.'),
  P('x', 'X', 'Social', ['reach', 'traffic', 'video', 'news'], 'Promoted posts, video, takeover', 'CPM, CPV, CPC', 'Verified Qatar reach and gender in the registry.'),
  P('reddit', 'Reddit', 'Community', ['reach', 'traffic', 'interest'], 'Promoted posts, conversation ads', 'CPM, CPC', 'Verified Qatar reach in the registry (no gender split published).'),
  T('inmobi', 'InMobi', 'Mobile ad network', ['reach', 'app', 'mobile', 'video', 'conversions', 'programmatic'], 'In-app display, rewarded and video, interstitial', 'CPM, CPI, CPC', 'In-app mobile reach beyond the social platforms and app installs. Confirm Qatar inventory and rates with InMobi.'),
  T('equativ', 'Equativ', 'SSP and ad server', ['premium', 'programmatic', 'video', 'reach', 'native', 'curated'], 'Premium publisher display and video, private marketplaces', 'CPM (PMP, guaranteed)', 'Access to premium publisher inventory and curated deals. Confirm regional publishers and deal terms with Equativ.'),
  T('miq', 'MiQ', 'Programmatic partner', ['programmatic', 'data', 'conversions', 'reach', 'measurement', 'retarget'], 'Managed programmatic across display, video, audio and CTV', 'CPM, outcome-based', 'Audience and data-led programmatic with measurement. Confirm Qatar coverage, data sources and fees with MiQ.'),
  T('ttd', 'The Trade Desk', 'DSP', ['programmatic', 'reach', 'video', 'audio', 'retarget', 'data', 'ctv'], 'Display, video, audio, connected TV', 'CPM', 'Independent DSP with wide supply. Confirm Qatar supply and seat access.'),
  T('dv360', 'Google Display and Video 360', 'DSP', ['programmatic', 'reach', 'video', 'retarget', 'measurement'], 'Display, video, audio, YouTube, connected TV', 'CPM', 'Google\'s DSP; pairs with Google data and measurement.'),
  T('taboola', 'Taboola', 'Native', ['native', 'traffic', 'reach', 'content'], 'Native recommendation widgets on publishers', 'CPC, CPM', 'Drives readers to content or landing pages. Confirm Qatar publisher coverage.'),
  T('outbrain', 'Outbrain', 'Native', ['native', 'traffic', 'content'], 'Native recommendation widgets on publishers', 'CPC', 'Content discovery on premium publishers. Confirm Qatar publisher coverage.'),
  T('teads', 'Teads', 'Outstream video', ['video', 'reach', 'premium'], 'Outstream video inside publisher articles', 'CPM, CPCV', 'Video reach in premium editorial environments. Confirm Qatar publisher coverage.'),
  T('criteo', 'Criteo', 'Retargeting', ['retarget', 'conversions', 'retail'], 'Dynamic product ads and retargeting', 'CPC, CPA', 'Re-engages shoppers and site visitors; needs a product feed or site tracking.'),
  T('moloco', 'Moloco', 'App performance DSP', ['app', 'conversions', 'mobile', 'retarget'], 'In-app install and re-engagement', 'CPI, CPA', 'Machine-learning app growth. Confirm Qatar supply.'),
  T('applovin', 'AppLovin', 'App performance network', ['app', 'mobile', 'video', 'conversions'], 'Rewarded, interstitial and playable ads in apps', 'CPI, CPM', 'App installs and gaming reach. Confirm Qatar supply.'),
  T('anghami', 'Anghami', 'Audio streaming', ['audio', 'reach', 'local'], 'Audio ads, display, sponsored playlists', 'CPM, flat', 'Regional music streaming. Confirm Qatar listener reach and rates with Anghami.'),
  T('spotify', 'Spotify Ads', 'Audio streaming', ['audio', 'reach', 'video'], 'Audio, video takeover, podcast ads', 'CPM', 'Audio streaming reach. Confirm Qatar availability and rates.'),
  T('talabat', 'Talabat Ads', 'Retail media', ['retail', 'conversions', 'local', 'traffic'], 'Sponsored listings and banners in the delivery app', 'CPC, CPM', 'Reaches people ordering food and groceries. Confirm Qatar rates with Talabat.'),
  T('local-pubs', 'Local publishers (direct)', 'Direct publishers', ['premium', 'news', 'reach', 'local', 'content', 'arabic'], 'Display, takeovers, sponsored content, newsletters', 'CPM, flat', 'Qatar news and lifestyle sites bought directly. Rates come from each publisher\'s rate card.')
];
const WHY = { reach: 'the brief asks for reach or awareness', video: 'the brief asks for video or views', traffic: 'the brief asks for traffic or clicks', leads: 'the brief asks for leads or sign-ups', conversions: 'the brief asks for sales or conversions', app: 'the brief mentions an app or installs', b2b: 'the audience is business or professional', retarget: 'the brief mentions retargeting or re-engagement', audio: 'the brief mentions audio or music', native: 'the brief suits content or native formats', retail: 'the brief mentions delivery, shoppers or retail', search: 'the brief mentions search or intent', news: 'the brief mentions news or publishers', content: 'the brief suits content or articles', premium: 'the brief calls for premium environments', local: 'the brief is local to Qatar', arabic: 'the brief needs Arabic-language media', data: 'the brief asks for data-led targeting', measurement: 'the brief asks for measurement' };
const BROAD = new Set(['reach', 'traffic', 'video']);   // almost every brief wants these, so they count for less than a specific need
const RULES = [['reach', /aware|reach|brand|launch|grp|visib|top of funnel/i], ['video', /video|view|vtr|thruplay|completion|film|reel/i], ['traffic', /traffic|click|visit|landing|website/i], ['leads', /lead|sign.?up|regist|enquir|inquir|application|form|subscri/i], ['conversions', /convert|conversion|sale|purchase|order|cpa|roas|booking|checkout/i],
  ['app', /\bapp\b|install|download/i], ['b2b', /b2b|business.to.business|corporate|executive|c-?suite|decision.?maker|enterprise|\bsme\b|procurement|job title/i], ['retarget', /retarget|remarket|re-?engage|abandon|lapsed/i], ['audio', /audio|podcast|radio|music|jingle|spotify|anghami/i], ['native', /article|native|thought leadership|editorial|content marketing/i],
  ['retail', /deliver|grocery|food|shopper|retail media|e-?commerce|basket/i], ['search', /search|intent|keyword/i], ['news', /news|press|publisher/i], ['content', /content|story|blog|article/i], ['premium', /premium|luxury|high.?end|affluent/i], ['arabic', /arabic|عرب/i], ['data', /data|audience segment|lookalike|first.?party/i], ['measurement', /measure|brand lift|attribution|verification|viewab/i]];

// brief: { objectives, kpis, constraints, interests, target:{gender}, ... }. Returns every supplier with a score and the reasons, best first.
// Default tick: a specific match, or enough broad matches plus published reach, best ten only.
PI.defaultPicks = list => new Set(list.filter(x => x.score >= 3).slice(0, 10).map(x => x.s.id));
PI.supplierShortlist = (brief, reg, pop) => {
  const text = [brief.objectives, brief.kpis, brief.interests, brief.constraints, brief.text].join(' \n '), wants = new Set(RULES.filter(([, rx]) => rx.test(text)).map(([k]) => k));
  if (!wants.size) wants.add('reach');
  const A = window.PIAudience, tg = brief.target || {}, reach = reg && pop ? A.reachForTarget(reg, pop, { gender: tg.gender, ageFrom: +tg.ageFrom || 18, ageTo: +tg.ageTo || 120 }) : null;
  return PI.SUPPLIERS.map(s => {
    const hit = s.tags.filter(t => wants.has(t)), reasons = hit.map(t => WHY[t]);
    let reachNote = '';
    if (s.kind === 'platform') { const keys = A.platformKeys(s.name === 'YouTube (Google Ads)' ? 'YouTube' : s.name), rows = reach ? reach.rows.filter(r => keys.includes(r.key)) : [];
      if (rows.length) { const best = rows.slice().sort((a, b) => (b.genderAudience || 0) - (a.genderAudience || 0))[0]; if (best.genderAudience) reachNote = `${best.label}: ${PI.compact(best.genderAudience)} ${tg.gender === 'male' ? 'men' : tg.gender === 'female' ? 'women' : 'people'} reachable (published)`; } }
    const score = hit.reduce((a, t) => a + (BROAD.has(t) ? 1 : 3), 0) + (reachNote ? 1 : 0);
    return { s, score, reasons, reachNote };
  }).sort((a, b) => b.score - a.score);
};
})();
