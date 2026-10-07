# Feature Parity Test

Run against the live Vercel + Neon deployment (use test data), comparing against the Hugging Face Space. Fill in yes/no and notes. **Not yet run: nothing is deployed.**

| Feature | Original works | Migrated works | Visual parity | Data parity | Notes |
|---|---|---|---|---|---|
| Login / logout / session cookie via Vercel domain | | | | | |
| Change password | | | | | |
| Home | | | | | |
| Command centre | | | | | |
| Assistant chat + saved conversations | | | | | |
| Library | | | | | |
| Clients + client selector | | | | | |
| Usage page | | | | | |
| Admin: users | | | | | |
| Admin: AI engine health check | | | | | |
| Admin: settings and pricing | | | | | |
| Admin: usage | | | | | |
| Credits metering and 402 at zero | | | | | |
| Image generation (GPT Image, Nano Banana) | | | | | |
| Audio (voice, clone, music) | | | | | |
| MMM modelling (large upload) | | | | | |
| Media plan builder | | | | | |
| Charts / Export | | | | | |
| Live web research with sources | | | | | |
| Strategy agents (5) | | | | | |
| Creative agents (6) | | | | | |
| Media agents (5) | | | | | |
| Finance agents (4) | | | | | |
| Production agents (3) | | | | | |
| Search agents (5) | | | | | |

## Migration-specific checks
- [ ] A long (>2 min) agent run streams to completion inside the 300 s function limit
- [ ] `/files/<id>` media loads and persists across cold starts
- [ ] Data survives a redeploy
- [ ] Session cookie is set and survives reload
- [ ] 30 MB upload paths (`/api/files`, `/api/ai` with images, `/api/mmm`): expect 413 above ~4.5 MB on Vercel (old limit was 30 MB); note which features are affected
