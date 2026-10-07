# Feature Parity Test

Run after the Fly + Vercel stack is up (staging data only), comparing against the Hugging Face Space. Fill in yes/no and notes. **Not yet run: nothing is deployed.**

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
- [ ] A long (>2 min) agent run streams to completion through Vercel's rewrite
- [ ] `/files/<id>` media loads and persists after a Fly machine restart
- [ ] Data survives `fly machine restart` and a redeploy
- [ ] Cookie is set on the Vercel domain and survives reload
- [ ] 30 MB upload paths (`/api/files`, `/api/ai` with images, `/api/mmm`): compare behavior with the original through the Vercel proxy (limits may differ)
