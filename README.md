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

Prerequisites: Node 22.13 or newer. There are no npm dependencies to install.

```bash
git clone <repository>
cd publicis-intelligence
cp .env.example .env   # fill in only what you need; .env is git-ignored
node --env-file=.env server.js
```

Open http://localhost:7860 (or your `PORT`). Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` to create the first admin. Variables are documented in `docs/ENVIRONMENT_VARIABLES.md`.

Testing: there is no automated test suite yet. CI runs a syntax check, a boot and `/api/health` check, and a Docker build on every Pull Request.

Branches and Pull Requests: see `CONTRIBUTING.md`. Branch from `develop`, open a PR, and wait for review. `main` is protected.

Deployment: production is owner-controlled. See `docs/VERCEL_ARCHITECTURE.md` and `docs/DEPLOYMENT_GUIDE.md`.
