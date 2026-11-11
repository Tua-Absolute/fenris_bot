# Runs Fenris anywhere Docker runs (Railway, Fly.io, a VPS, ...).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Scheduled announcements are saved here. On Railway, attach a Volume mounted at /app/data.
ENV DATA_DIR=/app/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY assets ./assets
# Runs as root so it can write to a mounted volume (Railway volumes are owned by root).
CMD ["node", "dist/index.js"]
