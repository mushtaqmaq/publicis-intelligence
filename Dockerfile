# Optional: run the whole platform as a plain Node server (needs DATABASE_URL pointing at Postgres).
# Production runs on Vercel (see docs/DEPLOYMENT_GUIDE.md); this image is for local or alternative hosting.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx next build
ENV PORT=7860 NODE_ENV=production NODE_NO_WARNINGS=1
EXPOSE 7860
CMD ["npx", "next", "start", "-p", "7860"]
