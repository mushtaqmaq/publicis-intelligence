---
title: Publicis Intelligence
emoji: 🎯
colorFrom: blue
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# Publicis Intelligence

The agency platform for Publicis Media Qatar. Runs independently of claude.ai on your own server and your own AI provider key.

## What you need
1. An API key from an OpenAI-compatible provider. OpenRouter is the simplest: one key reaches Claude, GPT, Gemini, Perplexity Sonar, Llama, Qwen and DeepSeek. OpenAI, Azure OpenAI, or a self-hosted vLLM or Ollama server also work.
2. Somewhere to run it: your laptop, a company server, Render, Railway, or a Hugging Face Space.

## Run on your laptop
1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and fill in the key, model ids and password.
3. Run: `node --env-file=.env server.js`
4. Open http://localhost:7860

## Deploy to a Hugging Face Space
1. Create a new Space, choose **Docker** as the SDK, set it to **Private**.
2. Upload every file in this folder (this README carries the Space settings at the top).
3. In the Space **Settings > Variables and secrets**, add `LLM_API_KEY` and `APP_PASSWORD` as secrets, and `LLM_BASE_URL`, `MODEL_DEFAULT`, `MODEL_COMPLEX`, `MODEL_QUICK` (and optionally `MODEL_RESEARCH`, `MODEL_CREATIVE`) as variables.
4. Turn on **Persistent storage** and set the variable `DATA_DIR=/data`, otherwise clients and the library reset when the Space restarts.
5. Open the Space URL and sign in.

## Deploy to Render or Railway
Create a web service from this folder (Docker), add the same environment variables, and attach a persistent disk mounted at `/data`.

## Model routing
- `MODEL_QUICK`: invoices and short tasks
- `MODEL_DEFAULT`: most agents
- `MODEL_COMPLEX`: orchestrator, research, strategy, media planning, fees, SEO strategy
- `MODEL_RESEARCH` (optional): Research and Competitor agents; point it at a live-web model for current information
- `MODEL_CREATIVE` (optional): every Creative agent

## Data
Clients, projects and library outputs are stored in `DATA_DIR/db.json`. Back it up.
Uploaded documents are read in the browser; only their text is sent to the AI provider.
