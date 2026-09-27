/* The agency's pillars and their agents. Edit tasks here to change how each agent works. */
(function () {
  const area = (key, label, ph, tall) => ({ key, label, type: 'textarea', ph, tall });
  const text = (key, label, ph) => ({ key, label, type: 'text', ph });
  const sel = (key, label, options) => ({ key, label, type: 'select', options });
  const row = (...items) => ({ type: 'row', items: items.map(([key, label, ph]) => ({ key, label, type: 'text', ph })) });

  window.PILLARS = [
    { id: 'strategy', name: 'Strategy', icon: 'compass', color: '#3B6FF6', desc: 'Research, competitor intelligence, audience insight, communications strategy and pitch storylines.', agents: [
      { id: 'research', name: 'Deep research', icon: 'book-open', tier: 'complex', blurb: 'A structured, sourced report on any market, category or question.',
        fields: [area('brief', 'Research question', 'e.g. How are GCC banks using gaming and esports to reach Gen Z?', true), sel('depth', 'Depth', ['Deep dive', 'Executive overview'])],
        task: 'Produce a research report: executive summary, market context, key findings grouped by theme, notable brand examples, data points with sources where available, implications for the client, and open questions. Mark any figure that is not from a cited source as an estimate.' },
      { id: 'competitor', name: 'Competitor intelligence', icon: 'target', tier: 'complex', blurb: 'Positioning, messaging, channels and gaps across named competitors.',
        fields: [text('competitors', 'Competitors', 'e.g. Commercial Bank, Doha Bank, Dukhan Bank'), area('brief', 'Focus', 'What do you want to understand?')],
        task: 'Build a competitor intelligence brief: a comparison table (positioning, key messages, hero products, channel presence, creative style, likely media weight), strengths and weaknesses of each, white space the client can own, and threats to watch.' },
      { id: 'audience', name: 'Audience insight', icon: 'users', tier: 'default', blurb: 'Personas, motivations, barriers and media habits in Qatar and the GCC.',
        fields: [text('audience', 'Audience', 'e.g. Qatari women 25 to 40, working professionals'), area('brief', 'Product or context', 'What are we selling to them?')],
        task: 'Create an audience insight pack: 3 personas (who they are, motivations, barriers, a day in their media life in Qatar), key moments and cultural calendar touchpoints, platform and media habits, and 3 sharp insight statements written as first-person truths.' },
      { id: 'comms', name: 'Communications strategy', icon: 'brain', tier: 'complex', blurb: 'From business problem to strategic idea, channel roles and KPIs.',
        fields: [area('brief', 'Brief', 'Paste the client brief', true)],
        task: 'Write the communications strategy: business problem, objectives, audience, insight, strategic idea, role of communications, channel roles across the funnel, campaign phasing, and a KPI framework table (stage, KPI, target, measurement source).' },
      { id: 'pitch', name: 'Pitch storyline', icon: 'presentation', tier: 'complex', blurb: 'Slide-by-slide narrative for a pitch or RFP response.',
        fields: [area('brief', 'RFP or pitch brief', 'Paste the RFP summary or brief', true), text('slides', 'Slide count', 'e.g. 20')],
        task: 'Build the pitch storyline: the one-line winning thought, then a slide-by-slide table (slide number, title, key message, content, suggested visual), followed by an opening line for the presenter and a closing line.' }
    ] },
    { id: 'creative', name: 'Creative', icon: 'sparkles', color: '#E5487A', desc: 'Copy, images, video scripts, audio, adaptations and brand checks, in English and Arabic.', agents: [
      { id: 'image', name: 'Image studio', icon: 'image', kind: 'image', blurb: 'Generate campaign visuals and key art with open-source image models.',
        fields: [area('brief', 'Describe the image', 'e.g. A Qatari family at golden hour on the Corniche, cinematic, warm light, room for a headline at the top', true), sel('aspect', 'Format', ['Square 1:1', 'Portrait 4:5', 'Story 9:16', 'Landscape 3:2', 'Wide 16:9']), sel('enhance', 'Prompt', ['Enhance my description', 'Use exactly as written'])] },
      { id: 'copy', name: 'Copywriter', icon: 'pen-tool', tier: 'default', blurb: 'Creative routes with headlines, body copy and CTAs per channel.',
        fields: [area('brief', 'Brief', 'What is the campaign and message?', true), text('channels', 'Channels', 'e.g. Instagram, Snapchat, OOH, radio')],
        task: 'Write 3 distinct creative routes. For each: route name, the idea in one sentence, a campaign line, 3 headline options, body copy, CTAs, and channel-specific versions for every channel requested. Arabic must be native, natural Gulf marketing Arabic, never a literal translation.' },
      { id: 'visual', name: 'Art director', icon: 'palette', tier: 'default', blurb: 'Visual concepts and production-ready prompts for image models.',
        fields: [area('brief', 'Concept or brief', 'Describe the concept'), text('formats', 'Formats', 'e.g. 9:16, 1:1, 16:9 DOOH')],
        task: 'Deliver art direction: visual concept, mood, composition, lighting, palette from the brand guidelines, and for each format a production-ready image prompt plus a negative prompt. Logos, packshots and on-image text are added afterwards, so never ask the model to render text or logos; specify where copy and logo will sit.' },
      { id: 'video', name: 'Video scripts', icon: 'video', tier: 'default', blurb: 'Scripts, storyboards, shot lists and prompts for video models.',
        fields: [area('brief', 'Brief', 'What is the film about?'), sel('duration', 'Duration', ['6s', '15s', '30s', '60s']), text('platform', 'Platform', 'e.g. TikTok, YouTube, TV')],
        task: 'Write the video script as a table (timecode, visual, VO English, VO Arabic, super, sound). Then storyboard frame descriptions, a shot list, and one AI video prompt per shot covering subject, action, camera move, lens, lighting and style. Keep VO word counts realistic for the duration.' },
      { id: 'audio', name: 'Audio', icon: 'mic', tier: 'default', blurb: 'Radio spots, voiceover, podcast reads and music briefs.',
        fields: [area('brief', 'Brief', 'What is the message?'), sel('format', 'Format', ['Radio spot', 'Podcast ad read', 'Voiceover', 'Jingle or music track']), sel('duration', 'Duration', ['15s', '20s', '30s', '45s', '60s'])],
        task: 'Write the audio script in English and Arabic with timings and word counts matched to duration, voice casting direction, music and sound direction, and mandatory lines. For a music track, add a style prompt (genre, tempo, instruments, mood, vocals) and structured lyrics with [Verse] and [Chorus] tags.' },
      { id: 'adapt', name: 'Adaptation matrix', icon: 'layers', tier: 'default', blurb: 'One master idea adapted to every platform, size and language.',
        fields: [area('brief', 'Master copy or concept', 'Paste the approved master', true), text('platforms', 'Platforms', 'e.g. Meta, TikTok, Snap, Google Display, DOOH')],
        task: 'Build an adaptation matrix table: platform, placement, dimensions, safe zone notes, character limits, adapted copy in English, adapted copy in Arabic, and 2 A/B variants per placement.' },
      { id: 'guardian', name: 'Brand guardian', icon: 'shield', tier: 'default', blurb: 'Check copy or concepts against brand, culture and compliance.',
        fields: [area('brief', 'Content to review', 'Paste copy or describe the creative', true)],
        task: 'Review the content against the client brand profile, tone of voice, cultural sensitivity for Qatar and the GCC, and category compliance. Give a scorecard table (area, rating, issue, fix), then a corrected version.' }
    ] },
    { id: 'media', name: 'Media', icon: 'megaphone', color: '#0EA5A0', desc: 'Online and offline planning, platform build sheets, optimization, reporting and analysis.', agents: [
      { id: 'plan', name: 'Media planner', icon: 'calendar-clock', tier: 'complex', blurb: 'Integrated plans with budget split, flighting and KPIs.',
        fields: [area('brief', 'Objective and brief', 'What must the campaign achieve?'), row(['budget', 'Budget (QAR)', 'e.g. 750000'], ['duration', 'Duration', 'e.g. 8 weeks']), sel('mix', 'Media mix', ['Integrated (online and offline)', 'Online only', 'Offline only']), text('audience', 'Audience', 'Who are we reaching?')],
        task: 'Build the media plan: strategy summary, channel roles, a budget table (channel, platform or vendor, buying model, budget QAR, share %, estimated CPM or CPC range for Qatar, estimated impressions, KPI), a weekly flighting table and the measurement plan. Offline can include TV, radio, OOH, DOOH, print, cinema and malls. Label cost benchmarks as estimates to confirm against current rate cards.' },
      { id: 'setup', name: 'Campaign setup', icon: 'settings-2', tier: 'default', blurb: 'Platform build sheets ready for trafficking.',
        fields: [text('platforms', 'Platforms', 'e.g. Meta, Google Ads, TikTok, Snap, DV360'), area('brief', 'Campaign details', 'Objective, audience, budget, dates, creatives')],
        task: 'For each platform produce a build sheet: campaign, ad set and ad structure as a table, naming convention, objective and optimization event, bidding, budget split, targeting, placements, tracking (pixel events, conversions API, UTMs) and a pre-launch QA checklist.' },
      { id: 'optimize', name: 'Optimization', icon: 'activity', tier: 'complex', blurb: 'Paste live performance data and get prioritized actions.',
        fields: [area('data', 'Performance data', 'Paste the export or table, or attach the file', true), text('goals', 'Targets', 'e.g. CPA under QAR 40, CTR above 0.8%')],
        task: 'Diagnose performance against the targets, then give a prioritized action table (action, reason, expected impact, effort, when), a budget reallocation recommendation and what to test next.' },
      { id: 'report', name: 'Reporting', icon: 'bar-chart-3', tier: 'default', blurb: 'Client-ready performance reports from raw data.',
        fields: [area('data', 'Performance data', 'Paste the data or attach the file', true), text('period', 'Period', 'e.g. September 2026')],
        task: 'Write the client performance report: headline summary, KPI versus target table, channel and platform performance, what worked and what did not, insights and next-period actions.' },
      { id: 'analyst', name: 'Data analyst', icon: 'line-chart', tier: 'complex', blurb: 'Ask any question of your campaign data.',
        fields: [area('data', 'Data', 'Paste the data or attach the file', true), text('question', 'Question', 'e.g. Why did CPA rise in week 3?')],
        task: 'Answer the question: the answer first, the evidence from the data, likely causes ranked by probability, and what to do about it.' }
    ] },
    { id: 'finance', name: 'Finance', icon: 'wallet', color: '#C9971A', desc: 'Fee proposals, retainer models, budget reconciliation, invoicing and profitability.', agents: [
      { id: 'fee', name: 'Fee estimator', icon: 'calculator', tier: 'complex', blurb: 'FTE-based retainer and project fee proposals.',
        fields: [area('brief', 'Scope of work', 'Describe the scope', true), row(['duration', 'Duration', 'e.g. 12 months'], ['model', 'Commercial model', 'e.g. retainer plus commission'])],
        task: 'Build the fee proposal: a resource table (role, seniority, allocation %, monthly hours, hourly rate QAR, monthly cost), monthly and total fee, optional media commission and tactical fees, payment terms, and scope and assumptions. Mark rates as adjustable assumptions. Check that every total adds up.' },
      { id: 'reconcile', name: 'Budget reconciliation', icon: 'scale', tier: 'default', blurb: 'Planned versus actual spend with variance flags.',
        fields: [area('data', 'Planned vs actual', 'Paste plan and delivered spend, or attach the file', true)],
        task: 'Reconcile planned versus actual: a variance table (line, planned, actual, variance, variance %, flag), a summary of over and under delivery, likely reasons, and actions including make-goods or credits to request.' },
      { id: 'invoice', name: 'Invoice drafter', icon: 'receipt', tier: 'quick', blurb: 'Invoice line items and the cover email.',
        fields: [area('brief', 'Billing details', 'Client, PO, services, amounts, period', true)],
        task: 'Draft the invoice content (header details, line item table, subtotal, tax line if applicable, total, payment terms) and a short professional cover email.' },
      { id: 'profit', name: 'Profitability', icon: 'chart-pie', tier: 'complex', blurb: 'Margin by client or project from fees, hours and costs.',
        fields: [area('data', 'Fees, hours and costs', 'Paste the numbers or attach the file', true)],
        task: 'Calculate profitability: margin table, effective hourly rate, over-servicing flags and actions to protect margin.' }
    ] },
    { id: 'production', name: 'Production', icon: 'clapperboard', color: '#7C5CF5', desc: 'Job planning, delivery specs, vendor briefs and timelines.', agents: [
      { id: 'job', name: 'Job planner', icon: 'list-checks', tier: 'default', blurb: 'Job bag, timeline and owners from an approved brief.',
        fields: [area('brief', 'Approved brief', 'Paste the brief', true), text('deadline', 'Go-live date', 'e.g. 20 October 2026')],
        task: 'Create the job bag: deliverables list, a timeline table working back from the go-live date (task, owner role, start, due, dependency), approval gates, and risks with mitigations.' },
      { id: 'specs', name: 'Spec sheet', icon: 'ruler', tier: 'default', blurb: 'Delivery specs for every platform and screen.',
        fields: [area('brief', 'Deliverables', 'List platforms, placements and screens')],
        task: 'Produce a spec sheet table: platform, placement, dimensions, aspect ratio, duration, file type, max file size, safe zones, character limits. Note that specs should be confirmed against each platform\'s latest documentation before delivery.' },
      { id: 'vendor', name: 'Vendor brief', icon: 'truck', tier: 'default', blurb: 'Shoot and production briefs with an RFQ.',
        fields: [area('brief', 'Production need', 'What needs producing?', true)],
        task: 'Write the production brief and RFQ: overview, deliverables, references, crew and talent, locations and permits in Qatar, schedule, budget line items for vendors to quote against, and submission instructions.' }
    ] },
    { id: 'search', name: 'Search', icon: 'search', color: '#16A36A', desc: 'SEO, answer engine optimization and local search, in English and Arabic.', agents: [
      { id: 'audit', name: 'SEO audit', icon: 'gauge', tier: 'complex', blurb: 'Prioritized fixes from page content and site details.',
        fields: [area('data', 'Page content or site details', 'Paste the page text, meta tags and structure', true)],
        task: 'Audit the page: a findings table (area, issue, priority, fix) covering titles, meta, headings, content depth, internal links, schema, Arabic and hreflang handling, and technical signals visible in the input. Then give a rewritten title, meta description and H1.' },
      { id: 'keywords', name: 'Keyword strategy', icon: 'layers', tier: 'complex', blurb: 'English and Arabic keyword clusters mapped to pages.',
        fields: [area('brief', 'Business and topic', 'What does the client offer?'), text('market', 'Market', 'e.g. Qatar')],
        task: 'Build keyword clusters in English and Arabic: a table (cluster, primary keyword, secondary keywords, intent, relative priority, target page). Mark volumes as estimates to validate in a keyword tool.' },
      { id: 'aeo', name: 'AI answer visibility', icon: 'wand-sparkles', tier: 'complex', blurb: 'Get the brand cited in AI assistant answers.',
        fields: [area('brief', 'Brand and category', 'Who is the brand and what should AI assistants say about it?')],
        task: 'Build the answer engine optimization plan: questions people ask AI assistants in this category (English and Arabic), the answer the brand should own for each, content and page structure fixes, FAQ blocks, schema types, third-party citation sources to build, and a monthly tracking method.' },
      { id: 'local', name: 'Local SEO', icon: 'map-pin', tier: 'default', blurb: 'Google Business Profile, reviews and local rankings.',
        fields: [area('brief', 'Business and locations', 'Brand, branches, areas served')],
        task: 'Build the local SEO plan: Google Business Profile optimization (categories, descriptions in English and Arabic, attributes, photos), a monthly posts calendar, review response templates, local citation sources in Qatar, and tracking.' },
      { id: 'content', name: 'SEO writer', icon: 'file-text', tier: 'default', blurb: 'Search and AI-ready articles and pages.',
        fields: [text('topic', 'Topic', 'e.g. How to choose a credit card in Qatar'), text('keyword', 'Primary keyword', 'e.g. best credit card Qatar'), sel('length', 'Length', ['800 words', '1200 words', '1800 words'])],
        task: 'Write the full article: meta title, meta description, H1, a direct answer paragraph at the top, structured body with H2 and H3, an FAQ section, and a suggested schema type.' }
    ] }
  ];
})();
