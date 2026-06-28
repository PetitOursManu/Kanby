import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import { API_TOKEN_PREFIX_LEN } from "@/lib/constants";

/** Prefix used on all raw API tokens so they are easy to identify. */
export const TOKEN_PREFIX = "kbt_";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a new raw API token (`kbt_<64 hex chars>`), persist its SHA-256
 * hash and an 8-char display prefix, and return the raw token ONCE.
 */
export async function createApiToken(userId: string, label: string): Promise<{
  raw: string;
  token: { id: string; label: string; prefix: string; createdAt: Date };
}> {
  const bytes = crypto.randomBytes(32).toString("hex");
  const raw = `${TOKEN_PREFIX}${bytes}`;
  const tokenHash = sha256(raw);
  const prefix = bytes.slice(0, API_TOKEN_PREFIX_LEN);

  const token = await prisma.apiToken.create({
    data: { userId, label, tokenHash, prefix },
  });

  return {
    raw,
    token: { id: token.id, label: token.label, prefix: token.prefix, createdAt: token.createdAt },
  };
}

/** Revoke a token by id (only if it belongs to the user). */
export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const t = await prisma.apiToken.findUnique({ where: { id: tokenId } });
  if (!t || t.userId !== userId) return false;
  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
  return true;
}

/**
 * Resolve a raw API token (from a Bearer header or `?token=` query param) to
 * a user. Returns null if the token is missing, revoked, or the user is
 * inactive. Updates `lastUsedAt` on success.
 */
export async function resolveApiTokenUser(rawToken: string | null | undefined): Promise<User | null> {
  if (!rawToken) return null;
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = sha256(rawToken);
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!token || token.revokedAt) return null;
  if (!token.user.active) return null;

  // Best-effort update of lastUsedAt; don't fail the request if it errors.
  prisma.apiToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return token.user;
}