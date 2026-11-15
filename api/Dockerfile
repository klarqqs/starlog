# Build context is the repo root, because the API serves web/index.html and collector/tracker.js.
FROM node:22-slim
WORKDIR /app
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev
COPY api ./api
COPY web ./web
COPY collector ./collector
USER node
WORKDIR /app/api
EXPOSE 4000
CMD ["node", "src/server.js"]
