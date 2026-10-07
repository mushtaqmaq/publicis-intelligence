# Optional: run the app as a plain Node server (needs DATABASE_URL pointing at Postgres).
# Production runs on Vercel (see docs/DEPLOYMENT_GUIDE.md); this image is for local or alternative hosting.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV PORT=7860 NODE_ENV=production NODE_NO_WARNINGS=1
USER node
EXPOSE 7860
CMD ["node", "server.js"]
