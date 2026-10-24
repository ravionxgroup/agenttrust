FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /var/lib/agenttrust && chown 10001:10001 /var/lib/agenttrust && \
    chmod 700 /var/lib/agenttrust && touch /var/lib/agenttrust/gateway-audit.jsonl && \
    chown 10001:10001 /var/lib/agenttrust/gateway-audit.jsonl && \
    chmod 600 /var/lib/agenttrust/gateway-audit.jsonl
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
USER 10001:10001
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
