#!/bin/sh
# Kanby Docker entrypoint — applies migrations, seeds the default admin,
# then starts the Next.js server. Idempotent and safe on every boot.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] ERREUR : DATABASE_URL n'est pas défini." >&2
  exit 1
fi
if [ -z "$JWT_SECRET" ]; then
  echo "[entrypoint] ERREUR : JWT_SECRET n'est pas défini (générez-le avec : openssl rand -hex 32)." >&2
  exit 1
fi
if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[entrypoint] ATTENTION : JWT_SECRET est court (< 32 caractères). Remplacez-le par : openssl rand -hex 32" >&2
fi

# The database may still be starting (Coolify, first boot): retry migrations.
echo "[entrypoint] Applying database migrations..."
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 15 ]; then
    echo "[entrypoint] La base de données ne répond pas, abandon." >&2
    exit 1
  fi
  echo "[entrypoint] Base de données indisponible, nouvel essai dans 4 s ($i/15)..."
  sleep 4
done

echo "[entrypoint] Seeding default admin (if configured)..."
node prisma/seed.js || true

export KANBY_DB_READY=1
echo "[entrypoint] Starting Kanby on :${PORT:-3000}"
exec "$@"
