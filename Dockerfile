# ShopBite backoffice: one container per restaurant installation, configured only by env (README, "Betrieb").
FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# only the self-contained Nitro output; nothing is written at runtime (read-only file system works)
COPY --from=build --chown=root:root /app/.output ./.output
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
CMD ["bun", ".output/server/index.mjs"]
