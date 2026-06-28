#!/bin/sh
# Kanby Docker entrypoint — runs migrations + seeds the default admin,
# then starts the Next.js server. Idempotent and safe on every boot.
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Seeding default admin (if configured)..."
node prisma/seed.js || true

echo "[entrypoint] Starting Kanby on :3000"
exec "$@"