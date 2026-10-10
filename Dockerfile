FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV PORT=7860 NODE_ENV=production NODE_NO_WARNINGS=1
USER node
EXPOSE 7860
CMD ["node", "server.js"]
