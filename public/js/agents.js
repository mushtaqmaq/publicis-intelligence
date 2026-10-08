/* Pillars and agents. `tool` names a custom workspace; otherwise the agent runs as a brief-to-document agent. */
(function () {
const area = (key, label, ph) => ({ key, label, type: 'textarea', ph });
const text = (key, label, ph) => ({ key, label, type: 'text', ph });
const sel = (key, label, options) => ({ key, label, type: 'select', options });
const MARKETS = ['Qatar', 'United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Bahrain', 'Oman'];

PI.PILLARS = [
  { id: 'strategy', name: 'Strategy', icon: 'compass', color: '#2F6BFF', desc: 'Live web research, competitor and audience intelligence, communications strategy and pitch storylines.', agents: [
    { id: 'research', name: 'Deep research', icon: 'book-open', tier: 'complex', brief: 'What do you want to know?', ph: 'e.g. How are GCC banks using gaming and esports to reach Gen Z? What worked, what did it cost, and what should QNB do?',
      blurb: 'Perplexity-grade research across the live web, analysed by the strongest reasoning model, with every source cited.',
      fields: [sel('depth', 'Depth', ['Deep dive', 'Executive overview']), sel('market', 'Market focus', MARKETS)],
      task: 'Produce a research report: executive summary, context, key findings grouped by theme with cited evidence, notable brand examples, data points (each cited or marked as an estimate), implications for the client, recommended next moves, and open questions.' },
    { id: 'competitor', name: 'Competitor intelligence', icon: 'target', tier: 'complex', brief: 'What do you want to understand?', ph: 'e.g. How do these banks position their digital services, where are they spending, and where is the white space for QNB?',
      blurb: 'Traffic estimates, keywords, paid search and backlink authority from DataForSEO, plus live web and ad library research.',
      fields: [text('domains', 'Competitor websites', 'e.g. cbq.qa, dohabank.qa, dukhanbank.com (add the client first to compare)'), sel('market', 'Market', MARKETS)],
      task: 'Build a competitor intelligence brief in the spirit of Similarweb, Semrush and Ahrefs combined: a scorecard table using the live data (organic and paid traffic estimates, keyword footprint, authority), positioning and messaging, hero products and offers, channel presence and creative style, paid search activity, strengths and weaknesses of each, the white space the client can own, and threats to watch.' },
    { id: 'audience', name: 'Audience insight', icon: 'users', tier: 'complex', brief: 'Who are we trying to understand?', ph: 'e.g. Qatari women 25 to 40, working professionals, considering their first credit card',
      blurb: 'Real search demand in English and Arabic, published research and social signals, turned into personas and insights.',
      fields: [text('seeds', 'Search keywords to measure (optional)', 'e.g. credit card Qatar, بطاقة ائتمان'), sel('market', 'Market', MARKETS)],
      task: 'Create an audience insight pack in the spirit of GWI, Audiense and SparkToro: audience size and profile signals from published research (cited), search demand patterns from the live data (what they search, in which language, when), 3 personas (motivations, barriers, a day in their media life), where they spend attention (platforms, publications, creators, podcasts, places in Qatar), key moments and cultural calendar touchpoints, and 3 sharp insight statements written as first-person truths.' },
    { id: 'comms', name: 'Communications strategy', icon: 'brain', tier: 'complex', brief: 'Paste the client brief', ph: 'Paste the brief, or drop the brief document here',
      blurb: 'From business problem to strategic idea, channel roles and KPIs, written with the strongest reasoning model.',
      fields: [],
      task: 'Write the communications strategy: business problem, objectives, audience, insight, strategic idea, role of communications, channel roles across the funnel, campaign phasing, and a KPI framework table (stage, KPI, target, measurement source).' },
    { id: 'pitch', name: 'Pitch storyline', icon: 'presentation', tier: 'complex', brief: 'Paste the RFP or pitch brief', ph: 'Paste the RFP summary, or drop the RFP here',
      blurb: 'Slide-by-slide narrative for a pitch or RFP response.',
      fields: [text('slides', 'Slide count', 'e.g. 20')],
      task: 'Build the pitch storyline: the one-line winning thought, then a slide-by-slide table (slide number, title, key message, content, suggested visual), followed by an opening line for the presenter and a closing line.' }
  ] },
  { id: 'creative', name: 'Creative', icon: 'sparkles', color: '#E5487A', desc: 'Images, adaptations, audio, copy, art direction and video scripts, in English and Arabic.', agents: [
    { id: 'image', name: 'Image studio', icon: 'image', tool: 'image', blurb: 'Complex, photoreal campaign visuals with GPT Image or Nano Banana. Drop reference images to guide style and product.' },
    { id: 'adapt', name: 'Adaptation', icon: 'crop', tool: 'adapt', blurb: 'Drop one key visual and get it recomposed for every format, from Stories to MUPIs and leaderboards.' },
    { id: 'audio', name: 'Audio studio', icon: 'audio-lines', tool: 'audio', blurb: 'Real audio files: Arabic and English voiceover, voice cloning, music and jingles, on open-source models.' },
    { id: 'copy', name: 'Copywriter', icon: 'pen-tool', tier: 'complex', brief: 'What is the campaign and message?', ph: 'Describe the campaign, or drop the brief',
      blurb: 'Creative routes with headlines, body copy and CTAs per channel.',
      fields: [text('channels', 'Channels', 'e.g. Instagram, Snapchat, OOH, radio')],
      task: 'Write 3 distinct creative routes. For each: route name, the idea in one sentence, a campaign line, 3 headline options, body copy, CTAs, and channel-specific versions for every channel requested. Arabic must be native, natural Gulf marketing Arabic, never a literal translation.' },
    { id: 'visual', name: 'Art director', icon: 'palette', tier: 'complex', brief: 'Concept or brief', ph: 'Describe the concept, or drop references',
      blurb: 'Visual concepts and production-ready prompts, written at the level of a senior art director.',
      fields: [text('formats', 'Formats', 'e.g. 9:16, 1:1, 16:9 DOOH')],
      task: 'Deliver art direction: the visual idea, mood, composition, lighting, palette from the brand guidelines, casting and styling notes, and for each format a production-ready image prompt plus a negative prompt. Logos, packshots and on-image text are added afterwards, so specify where copy and logo sit rather than asking the model to render them.' },
    { id: 'video', name: 'Video scripts', icon: 'video', tier: 'complex', brief: 'What is the film about?', ph: 'Describe the film, or drop the brief',
      blurb: 'Scripts, storyboards, shot lists and prompts for video models.',
      fields: [sel('duration', 'Duration', ['6s', '15s', '30s', '60s']), text('platform', 'Platform', 'e.g. TikTok, YouTube, TV')],
      task: 'Write the video script as a table (timecode, visual, VO English, VO Arabic, super, sound). Then storyboard frame descriptions, a shot list, and one AI video prompt per shot covering subject, action, camera move, lens, lighting and style. Keep VO word counts realistic for the duration.' }
  ] },
  { id: 'media', name: 'Media', icon: 'megaphone', color: '#0EA5A0', desc: 'Online, OOH and hybrid media plans, campaign builds, mix modelling, reporting and analysis.', agents: [
    { id: 'plan', name: 'Media planner', icon: 'calendar-clock', tool: 'mediaplan', blurb: 'Online, OOH or hybrid plans with real inventory and rates, versions and approvals, and agency-format Excel or PDF export.' },
    { id: 'setup', name: 'Campaign setup', icon: 'settings-2', tool: 'setup', blurb: 'Full platform builds with copy, targeting and tracking, exported as bulk-upload files.' },
    { id: 'optimize', name: 'Optimization', icon: 'sliders-horizontal', tool: 'optimize', blurb: 'Marketing mix modelling with saturation curves and a budget optimiser, plus live campaign diagnosis.' },
    { id: 'report', name: 'Reporting', icon: 'chart-column', tool: 'report', blurb: 'Drop platform exports and get a dashboard and a client-ready report.' },
    { id: 'analyst', name: 'Data analyst', icon: 'chart-line', tool: 'analyst', blurb: 'Ask questions of any campaign data in plain English and get answers, tables and charts.' }
  ] },
  { id: 'finance', name: 'Finance', icon: 'wallet', color: '#C9971A', desc: 'Fee proposals, retainer models, budget reconciliation, invoicing and profitability.', agents: [
    { id: 'fee', name: 'Fee estimator', icon: 'calculator', tier: 'complex', brief: 'Scope of work', ph: 'Describe the scope, or drop the RFP',
      blurb: 'FTE-based retainer and project fee proposals.',
      fields: [text('duration', 'Duration', 'e.g. 12 months'), text('model', 'Commercial model', 'e.g. retainer plus commission')],
      task: 'Build the fee proposal: a resource table (role, seniority, allocation %, monthly hours, hourly rate QAR, monthly cost), monthly and total fee, optional media commission and tactical fees, payment terms, scope and assumptions. Mark rates as adjustable assumptions. Check every total adds up.' },
    { id: 'reconcile', name: 'Budget reconciliation', icon: 'scale', tier: 'default', brief: 'Planned versus actual', ph: 'Paste plan and delivered spend, or drop the files',
      blurb: 'Planned versus actual spend with variance flags.', fields: [],
      task: 'Reconcile planned versus actual: a variance table (line, planned, actual, variance, variance %, flag), a summary of over and under delivery, likely reasons, and actions including make-goods or credits to request.' },
    { id: 'invoice', name: 'Invoice drafter', icon: 'receipt', tier: 'quick', brief: 'Billing details', ph: 'Client, PO, services, amounts, period',
      blurb: 'Invoice line items and the cover email.', fields: [],
      task: 'Draft the invoice content (header details, line item table, subtotal, tax line if applicable, total, payment terms) and a short professional cover email.' },
    { id: 'profit', name: 'Profitability', icon: 'chart-pie', tier: 'complex', brief: 'Fees, hours and costs', ph: 'Paste the numbers, or drop the file',
      blurb: 'Margin by client or project from fees, hours and costs.', fields: [],
      task: 'Calculate profitability: margin table, effective hourly rate, over-servicing flags, and actions to protect margin.' }
  ] },
  { id: 'multimedia', name: 'Multimedia', icon: 'clapperboard', color: '#7C5CF5', desc: 'Photography and video shoots, voice-over recording, editing and post-production: job planning, delivery specs, vendor briefs and timelines.', agents: [
    { id: 'job', name: 'Job planner', icon: 'list-checks', tier: 'default', brief: 'Approved brief', ph: 'Paste the brief, or drop it here',
      blurb: 'Job bag, timeline and owners from an approved brief.', fields: [text('deadline', 'Go-live date', 'e.g. 20 October 2026')],
      task: 'Create the job bag: deliverables list, a timeline table working back from the go-live date (task, owner role, start, due, dependency), approval gates, and risks with mitigations.' },
    { id: 'specs', name: 'Spec sheet', icon: 'ruler', tier: 'default', brief: 'Deliverables', ph: 'List platforms, placements and screens',
      blurb: 'Delivery specs for every platform and screen.', fields: [],
      task: 'Produce a spec sheet table: platform, placement, dimensions, aspect ratio, duration, file type, max file size, safe zones, character limits. Note that specs should be confirmed against each platform\'s latest documentation before delivery.' },
    { id: 'vendor', name: 'Vendor brief', icon: 'truck', tier: 'default', brief: 'Production need', ph: 'What needs producing?',
      blurb: 'Shoot and production briefs with an RFQ.', fields: [],
      task: 'Write the production brief and RFQ: overview, deliverables, references, crew and talent, locations and permits in Qatar, schedule, budget line items for vendors to quote against, and submission instructions.' }
  ] },
  { id: 'search', name: 'Search', icon: 'search', color: '#16A36A', desc: 'SEO audits, keyword strategy, AI answer visibility and local search, in English and Arabic.', agents: [
    { id: 'audit', name: 'SEO audit', icon: 'gauge', tier: 'complex', brief: 'Anything we should focus on?', ph: 'Optional: goals, target keywords, known issues',
      blurb: 'Reads the live page and audits titles, structure, schema, Arabic and hreflang, speed signals and content.',
      fields: [text('url', 'Page to audit', 'e.g. https://www.qnb.com/sites/qnb/qnbqatar/page/en/en-home.html')],
      task: 'Audit the page using the live page signals provided: a findings table (area, issue, evidence, priority, fix) covering titles, meta, headings, content depth, internal links, schema, Arabic and hreflang handling, mobile, and technical signals. Then give a rewritten title, meta description and H1, and the top 5 fixes in order.' },
    { id: 'keywords', name: 'Keyword strategy', icon: 'layers', tier: 'complex', brief: 'Business and topic', ph: 'What does the client offer, and who to?',
      blurb: 'Real search volumes, CPCs and trends in English and Arabic, clustered and mapped to pages.',
      fields: [text('seeds', 'Seed keywords (optional)', 'e.g. personal loan, قرض شخصي'), sel('market', 'Market', MARKETS)],
      task: 'Build the keyword strategy from the live search data: clusters in English and Arabic as a table (cluster, primary keyword, volume, CPC, intent, secondary keywords, target page), quick wins, content gaps, and a 90-day priority plan.' },
    { id: 'aeo', name: 'AI answer visibility', icon: 'wand-sparkles', tier: 'complex', brief: 'Brand and category', ph: 'e.g. QNB, retail banking in Qatar: credit cards, personal loans, mobile banking',
      blurb: 'Asks AI assistants the questions your customers ask, measures whether the brand appears, and plans the fix.',
      fields: [text('brand', 'Brand name to look for', 'e.g. QNB, Qatar National Bank')],
      task: 'Build the answer engine optimization plan using the live AI visibility test: current visibility score and what the answers say, which sources AI assistants rely on, the answer the brand should own for each question, content and page structure fixes, FAQ blocks, schema types, third-party citation sources to build, and a monthly tracking method.' },
    { id: 'local', name: 'Local SEO', icon: 'map-pin', tier: 'default', brief: 'Business and locations', ph: 'Brand, branches, areas served',
      blurb: 'Google Business Profile, reviews and local rankings.', fields: [],
      task: 'Build the local SEO plan: Google Business Profile optimization (categories, descriptions in English and Arabic, attributes, photos), a monthly posts calendar, review response templates, local citation sources in Qatar, and tracking.' },
    { id: 'content', name: 'SEO writer', icon: 'file-text', tier: 'default', brief: 'Topic', ph: 'e.g. How to choose a credit card in Qatar',
      blurb: 'Search and AI-ready articles and pages.', fields: [text('keyword', 'Primary keyword', 'e.g. best credit card Qatar'), sel('length', 'Length', ['800 words', '1200 words', '1800 words'])],
      task: 'Write the full article: meta title, meta description, H1, a direct answer paragraph at the top, structured body with H2 and H3, an FAQ section, and a suggested schema type.' }
  ] }
];
PI.MODULES = [{ id: 'strategy', label: 'Strategy' }, { id: 'creative', label: 'Creative' }, { id: 'media', label: 'Media' }, { id: 'finance', label: 'Finance' }, { id: 'multimedia', label: 'Multimedia' }, { id: 'search', label: 'Search' }];
// Sections inside a module that an admin can switch off per person (kept in step with lib/modules.js; a test checks it).
PI.SECTIONS = { media: [{ id: 'dashboard', label: 'Dashboard' }, { id: 'plans', label: 'Media plans' }, { id: 'inventory', label: 'Inventory' }, { id: 'map', label: 'Map' }, { id: 'suppliers', label: 'Suppliers' }, { id: 'reports', label: 'Reports' }, { id: 'clients', label: 'Client accounts' }, { id: 'settings', label: 'Settings & imports' }] };
PI.pillar = id => PI.PILLARS.find(p => p.id === id);
PI.agentOf = (p, a) => (PI.pillar(p) || { agents: [] }).agents.find(x => x.id === a);
PI.routeName = r => { if (!r) return 'Other'; if (r.startsWith('assistant')) return 'Assistant'; if (r.startsWith('command')) return 'Command'; if (r === 'creative/image') return 'Image studio'; if (r === 'creative/audio') return 'Audio studio'; const [p, a] = r.split('/'); const ag = PI.agentOf(p, a); return ag ? ag.name : r; };
})();
