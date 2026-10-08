# Feature Parity Test

Honest status as of 2026-10-08. "Verified" means I observed it working (local with real-data copy, automated tests, or production smoke tests). "Owner to check" means it needs a person on the live site with real keys or a signed-in comparison to the Hugging Face Space. Nothing here was marked verified without being observed.

| Feature | Original works | Migrated works | Visual parity | Data parity | Notes |
|---|---|---|---|---|---|
| Login / logout / session cookie | n/a | Verified live (owner signed in) | Owner to check | n/a | Unified planner password format; old Space hashes still verify |
| Change password | n/a | Verified locally | Owner to check | n/a | |
| Home, Command centre, Assistant shell | n/a | Verified live (owner opened Home, Admin) | Owner to check | n/a | Pillars/nav filtered by module (verified locally) |
| Assistant chat + saved conversations | n/a | Verified locally (save/list/delete) | Owner to check | Space data not imported yet | |
| Library, Clients (workspace docs) | n/a | Verified locally (docs API) | Owner to check | Space data not imported yet | |
| Usage | n/a | Verified locally incl. date-range queries | Owner to check | n/a | |
| Admin: people, modules, credits, roles | n/a | Verified locally and live (screenshot of Admin) | Owner to check | n/a | |
| Admin: AI engine health check | n/a | Verified live (owner screenshot): Opus, Sonnet, Haiku, Sonar Pro working | Owner to check | n/a | Deep research model failed upstream (Perplexity); audio needs a Replicate key |
| Credits metering and 402 at zero | n/a | Verified locally (ledger rows written, atomic update) | n/a | n/a | |
| Strategy / Creative / Media / Finance / Production / Search agents (28) | n/a | Owner to check each with a real key | Owner to check | n/a | Routing and module checks verified; model output not verified |
| Image generation | n/a | Not verified (needs `OPENAI_API_KEY`) | | | |
| Audio generation | n/a | Not verified (needs `REPLICATE_API_TOKEN`) | | | |
| Live SEO data (competitor, keywords) | n/a | Not verified (needs DataForSEO) | | | |
| MMM modelling | n/a | Route verified (module check, input validation) | Owner to check | n/a | Request bodies over ~4.5 MB now fail on Vercel |
| Media planner (online / OOH / hybrid) | n/a | Verified locally on real data (see below) | n/a | Real inventory and rates | Replaces the old in-page tool |
| Large uploads (up to 30 MB originally) | yes | Limited to ~4.5 MB on Vercel | | | Known difference |

## Media planner checks (real-data restore, local)
Plan create/lock/new version/compare; add inventory line at real rate (gross 1,285,714, net 1,157,143 with 10% discount); online block save and totals; agency Excel/PDF (offline line matches the planner exactly; grand total matches the plan page); AI draft and inventory suggestions through the real routes with a fake provider (invented ids dropped, quantities clamped, stored total equals engine total); settings pages (20 render real data; revenue target, category rename, validation); module access (Strategy-only user refused on every page, action and route tried).

## Migration-specific checks
- [x] Production database migrated additively; existing planner data row counts unchanged (verified on a restore before and after)
- [x] Session cookie works on the Vercel domain
- [x] Module guard coverage enforced by a test
- [ ] A long (>2 min) agent run completes inside the 300 s function limit (owner to run a Deep research request)
- [ ] A real PDF rate-card upload works on Vercel
- [ ] Draft with AI and Suggest from inventory produce sensible output with the real key
- [ ] Space accounts and data imported and spot-checked
