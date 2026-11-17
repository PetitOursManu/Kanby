/**
 * Server-side glue for "Se connecter avec Kosmy Board": settings storage,
 * the Prisma account repository, and the flow cookie options.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/passwords";
import type { User } from "@prisma/client";
import type { KosmyAccountRepo } from "@/lib/kosmy-board/accounts";
import { FLOW_TTL_SECONDS } from "@/lib/kosmy-board/oidc";

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
