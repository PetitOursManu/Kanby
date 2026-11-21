/**
 * Server-side glue for "Se connecter avec Kosmy Board": settings storage,
 * the Prisma account repository, and the flow cookie options.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/passwords";
import type { User } from "@prisma/client";
import type { KosmyAccountRepo } from "@/lib/kosmy-board/accounts";
import { FLOW_TTL_SECONDS, clearDiscoveryCache, discover, normalizeIssuer } from "@/lib/kosmy-board/oidc";

export type KosmySettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  autoCreate: boolean;
};

/** Settings, or null when the admin has not configured Kosmy Board sign-in. */
export async function getKosmySettings(): Promise<KosmySettings | null> {
  const row = await prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } });
  if (!row || !row.issuer || !row.clientId || !row.clientSecret) return null;
  return { issuer: row.issuer, clientId: row.clientId, clientSecret: row.clientSecret, autoCreate: row.autoCreate };
}

export async function isKosmyEnabled(): Promise<boolean> {
  return (await getKosmySettings()) !== null;
}

/** What the admin screens may show: never the client secret, only whether one is saved. */
export type KosmySettingsView = { issuer: string; clientId: string; autoCreate: boolean; hasSecret: boolean };

export async function getKosmySettingsView(): Promise<KosmySettingsView> {
  const row = await prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } });
  return {
    issuer: row?.issuer ?? "",
    clientId: row?.clientId ?? "",
    autoCreate: row?.autoCreate ?? false,
    hasSecret: !!row?.clientSecret,
  };
}

export type SaveKosmyInput = { issuer?: unknown; clientId?: unknown; clientSecret?: unknown; autoCreate?: unknown };
export type SaveKosmyError = "invalid_issuer" | "invalid_client_id" | "invalid_client_secret" | "missing_client_secret";
export type SaveKosmyResult =
  | { ok: true; settings: KosmySettingsView; reachable: boolean }
  | { ok: false; error: SaveKosmyError };

/**
 * Save the "Se connecter avec Kosmy Board" settings (admin only).
 * An empty / missing clientSecret keeps the stored one. Then checks right away
 * whether the issuer answers (`reachable`).
 */
export async function saveKosmySettings(input: SaveKosmyInput): Promise<SaveKosmyResult> {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const issuer = normalizeIssuer(str(input.issuer));
  if (!issuer) return { ok: false, error: "invalid_issuer" };
  const clientId = str(input.clientId).trim();
  if (!clientId || clientId.length > 200) return { ok: false, error: "invalid_client_id" };

  const existing = await prisma.kosmyBoardSettings.findUnique({ where: { id: 1 } });
  const newSecret = str(input.clientSecret).trim();
  if (newSecret.length > 500) return { ok: false, error: "invalid_client_secret" };
  const clientSecret = newSecret || existing?.clientSecret || "";
  if (!clientSecret) return { ok: false, error: "missing_client_secret" };

  const data = { issuer, clientId, clientSecret, autoCreate: input.autoCreate === true };
  await prisma.kosmyBoardSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  clearDiscoveryCache();

  let reachable = true;
  try {
    await discover(issuer);
  } catch {
    reachable = false;
  }
  return { ok: true, settings: { issuer, clientId, autoCreate: data.autoCreate, hasSecret: true }, reachable };
}

/** Turn Kosmy Board sign-in off (links on accounts are kept). */
export async function disableKosmySettings(): Promise<void> {
  await prisma.kosmyBoardSettings.deleteMany({});
  clearDiscoveryCache();
}

export function flowCookieOptions(maxAge = FLOW_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.APP_URL || "").startsWith("https://"),
    path: "/auth/kosmy-board",
    maxAge,
  };
}

/**
 * Accounts created by Kosmy Board sign-in get an unusable random password: they
 * sign in through Kosmy Board only. Unlinking requires the current password, so
 * such an account cannot be unlinked (and locked out) by mistake.
 */
async function unusablePasswordHash(): Promise<string> {
  return hashPassword(crypto.randomBytes(32).toString("base64url"));
}

export const prismaAccountRepo: KosmyAccountRepo<User> = {
  findBySub: (sub) => prisma.user.findUnique({ where: { kosmySub: sub } }),
  findById: (id) => prisma.user.findUnique({ where: { id } }),
  emailTaken: async (email) => (await prisma.user.count({ where: { email } })) > 0,
  createUser: async ({ email, displayName, kosmySub }) =>
    prisma.user.create({
      data: {
        email,
        displayName,
        kosmySub,
        passwordHash: await unusablePasswordHash(),
        // Never an administrator, whatever the claims say.
        globalRole: "USER",
      },
    }),
  setSub: async (userId, sub) => {
    await prisma.user.update({ where: { id: userId }, data: { kosmySub: sub } });
  },
};
