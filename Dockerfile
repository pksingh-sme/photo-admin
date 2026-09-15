# linux/arm64 from the first image (Graviton). Pin by digest, never by tag.
# node:24-bookworm-slim linux/arm64, published 2026-09-09.
# FR-SEC-005 / Sprint 0 item 0.1
FROM --platform=linux/arm64 node@sha256:8d1405ad7696efa6941cb7745c2aa51d02549b900e4a40fdf212a1b5115dd1b9 AS build
WORKDIR /app
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm ci && npm run build && npm prune --omit=dev

FROM --platform=linux/arm64 node@sha256:8d1405ad7696efa6941cb7745c2aa51d02549b900e4a40fdf212a1b5115dd1b9 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
