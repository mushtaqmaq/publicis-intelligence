---
title: Publicis Intelligence
emoji: ✨
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Publicis Intelligence

The agentic platform for Publicis Media Qatar: Strategy, Creative, Media, Finance, Production, Search, Library and Clients, with a Command centre, an Assistant, team accounts, credits and an admin console.

## Settings (Hugging Face: Settings > Variables and secrets)

Secrets
- `OPENROUTER_API_KEY`: text, research, vision and Nano Banana images
- `OPENAI_API_KEY`: GPT Image
- `REPLICATE_API_TOKEN`: voiceover, voice cloning and music
- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`: live search, keyword and competitor data
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: the first admin sign-in
- `AI_API_KEY` or `HF_TOKEN` (optional): fallback to open models on Hugging Face

Variables
- `ADMIN_NAME`: your name
- `DATA_DIR`: `/data` (turn on persistent storage so accounts, the library and generated files survive restarts)

After signing in, open Admin > AI engine > Run health check. It tests every engine and shows the model it picked for each job.

## Run anywhere else
Node 22.13 or newer, no install step: `node --env-file=.env server.js`, then open http://localhost:7860.
Docker: `docker build -t pi . && docker run -p 7860:7860 --env-file .env -v pi-data:/data pi`

---

## Development (GitHub workflow)

Prerequisites: Node 22 and a Postgres database (a free Neon branch works; or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=pw postgres:16-alpine`).

```bash
git clone <repository>
cd publicis-intelligence
npm install
cp .env.example .env   # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD; .env is git-ignored
npx prisma migrate deploy   # create/upgrade tables (never run this against production by hand)
npm run dev
```

Open http://localhost:7860 (or your `PORT`). Variables are documented in `docs/ENVIRONMENT_VARIABLES.md`. Use a separate Neon branch for local work, never the production database.

Testing: there is no automated test suite yet. CI syntax-checks the code, boots the server against a Postgres service, signs in, and builds the Docker image on every Pull Request.

Branches and Pull Requests: see `CONTRIBUTING.md`. Branch from `develop`, open a PR, and wait for review. Never push to `main`.

Deployment: production runs entirely on Vercel (static frontend + one serverless function) with Neon Postgres. It is owner-controlled; see `docs/DEPLOYMENT_GUIDE.md`.
