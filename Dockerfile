# Kanby — multi-stage Dockerfile
# Syntax: docker/dockerfile:1.7 for heredoc support
# syntax=docker/dockerfile:1.7

# ---- 1. Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# ---- 2. Build ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- 3. Runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for security.
RUN addgroup -S kanby && adduser -S kanby -G kanby

# Copy only what's needed to run.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/instrumentation.ts ./instrumentation.ts
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && chown -R kanby:kanby /app
USER kanby

EXPOSE 3000

# The entrypoint applies migrations and seeds the default admin before
# starting the server, so `docker compose up` self-initializes.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "start"]