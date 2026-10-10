# Publicis Intelligence

The agentic platform for Publicis Media Qatar: Strategy, Creative, Media, Finance, Production and Search agents, a Command centre, an Assistant, a shared Library and Clients workspace, team accounts, credits and an admin console.

It is an AI media intelligence, research, analysis and recommendation tool. It holds no operational media data: no inventory, bookings, suppliers, finance or production records. Those belong to a separate SaaS product.

Originally built as a Hugging Face Space (`rinziii/Publicis-Intelligence`); this repository is the same application running on Vercel with a small Postgres database instead of the Space's local disk.

## How it runs

- `public/`: the single-page app (original, unchanged) served as static files.
- `server.js` + `lib/`: the original Node router, AI provider logic and tools. On Vercel it runs behind one function, `api/index.js`.
- Postgres (Neon): users, sessions, credits ledger, conversations, Library and Clients documents, settings, saved files. Tables are created automatically on first use.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Environment variables (names only; values live in Vercel)

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | first admin sign-in (created on first start) |
| `OPENROUTER_API_KEY` | text, research, vision and Nano Banana images |
| `OPENAI_API_KEY` | GPT Image |
| `REPLICATE_API_TOKEN` | voiceover, voice cloning and music |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | live search, keyword and competitor data |
| `AI_API_KEY` or `HF_TOKEN` | optional open-model fallback |

More optional names are in `.env.example`. After signing in, open Admin > AI engine > Run health check.

## Run locally

Node 22.13 or newer and a Postgres database:

```bash
npm install
DATABASE_URL=postgresql://... ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=choose-one node server.js
```

Open http://localhost:7860. Tests (need `DATABASE_URL` pointing at a throwaway database): `npm test`.

## Contributing and deploying

Everyone contributes through pull requests; see [CONTRIBUTING.md](CONTRIBUTING.md). Production deploys are manual and owner-controlled.
