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

The agency platform for Publicis Media Qatar. Eight pillars (Strategy, Creative, Media, Finance, Production, Search, Library, Clients), a Command centre that plans a brief across every pillar, an Assistant, team accounts with credits, and an admin console. It runs on open-source AI models.

## Settings (Hugging Face: Settings, Variables and secrets)

Secrets
- `AI_API_KEY`: a Hugging Face token with "Make calls to Inference Providers" permission
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: your admin sign-in
- `TAVILY_API_KEY` (optional): live web research

Variables
- `ADMIN_NAME`: your name
- `DATA_DIR`: `/data` (turn on persistent storage so accounts and the library survive restarts)

## Run anywhere else
Node 22.13 or newer, no install step: `node --env-file=.env server.js`, then open http://localhost:7860.
Docker: `docker build -t pi . && docker run -p 7860:7860 --env-file .env -v pi-data:/data pi`

## Models
Admin, AI engine shows every model your key can reach, tests them, and lets you choose the model for each job. Empty boxes choose the best available open model automatically, with fallbacks if one is unavailable.
