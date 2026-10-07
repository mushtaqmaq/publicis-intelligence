# Environment Variables

Names and purposes only. Never put real values in this repository.
Production values are owner-managed; contributors use their own local `.env` (git-ignored).

## ADMIN_EMAIL
- Used by: `server.js`
- Purpose: Bootstraps the first admin account
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## ADMIN_PASSWORD
- Used by: `server.js`
- Purpose: Password for the first admin
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## ADMIN_NAME
- Used by: `server.js`
- Purpose: Display name of the first admin
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## ADMIN_START_CREDITS
- Used by: `server.js`
- Purpose: Starting credits for the admin (default 100000)
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## RESET_ADMIN_PASSWORD
- Used by: `server.js`
- Purpose: Set to `1` to reset the admin password on boot
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## OPENROUTER_API_KEY
- Used by: `lib/providers.js`
- Purpose: Text, research, vision, Nano Banana images
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## OPENROUTER_BASE_URL
- Used by: `lib/providers.js`
- Purpose: Override OpenRouter endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## OPENAI_API_KEY
- Used by: `lib/providers.js`
- Purpose: GPT Image
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## OPENAI_BASE_URL
- Used by: `lib/providers.js`
- Purpose: Override OpenAI endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## REPLICATE_API_TOKEN
- Used by: `lib/providers.js`
- Purpose: Voiceover, voice cloning, music
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## REPLICATE_BASE_URL
- Used by: `lib/providers.js`
- Purpose: Override Replicate endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## AI_API_KEY
- Used by: `lib/llm.js, lib/providers.js`
- Purpose: Fallback open-model provider key
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## AI_BASE_URL
- Used by: `lib/llm.js`
- Purpose: Fallback provider endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## HF_TOKEN
- Used by: `lib/llm.js, lib/providers.js`
- Purpose: Hugging Face inference fallback
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## HF_BASE_URL
- Used by: `lib/providers.js`
- Purpose: Override HF endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## IMAGE_API_KEY
- Used by: `lib/llm.js`
- Purpose: Image provider key (legacy path)
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## IMAGE_URL
- Used by: `lib/llm.js`
- Purpose: Image endpoint template (legacy path)
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## DATAFORSEO_LOGIN
- Used by: `lib/dataforseo.js`
- Purpose: Live SEO, keyword and competitor data
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## DATAFORSEO_PASSWORD
- Used by: `lib/dataforseo.js`
- Purpose: DataForSEO password
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## DATAFORSEO_BASE_URL
- Used by: `lib/dataforseo.js`
- Purpose: Override DataForSEO endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## TAVILY_API_KEY
- Used by: `lib/search.js`
- Purpose: Optional web search
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## TAVILY_URL
- Used by: `lib/search.js`
- Purpose: Override Tavily endpoint
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## BRAVE_API_KEY
- Used by: `lib/search.js`
- Purpose: Optional web search
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: yes

## SEARXNG_URL
- Used by: `lib/search.js`
- Purpose: Optional self-hosted search
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## PORT
- Used by: `server.js`
- Purpose: HTTP port (default 7860 in Docker)
- Required environments: local: optional unless the feature is used | preview: n/a | production: per feature
- Secret: no

## DATABASE_URL
- Used by: `lib/db.js`
- Purpose: Neon Postgres connection string (use the pooled one on Vercel)
- Required environments: local: yes | preview: n/a | production: yes
- Secret: yes

