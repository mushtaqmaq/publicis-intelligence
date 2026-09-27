FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /data && chown node:node /data
ENV PORT=7860 NODE_ENV=production NODE_NO_WARNINGS=1
USER node
EXPOSE 7860
CMD ["node", "server.js"]
