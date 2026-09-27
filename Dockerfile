FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=7860 DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 7860
CMD ["node","server.js"]
