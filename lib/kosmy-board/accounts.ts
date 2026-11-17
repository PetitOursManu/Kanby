/**
 * Kosmy Board account resolution and linking.
 *
 * Accounts are matched on the Kosmy Board `sub` ONLY. The email Kosmy Board
 * sends is not verified (`email_verified` is always false): using it to find an
 * existing account would let anyone take over someone else's account.
 *
 * The logic works against a tiny repository interface so it can be tested
 * without a database; `prismaAccountRepo` is the real implementation.
 */
import type { KosmyClaims } from "@/lib/kosmy-board/oidc";

export type KosmyUser = { id: string; active: boolean };

export interface KosmyAccountRepo<U extends KosmyUser = KosmyUser> {
  findBySub(sub: string): Promise<U | null>;
  findById(id: string): Promise<(U & { kosmySub: string | null }) | null>;
  emailTaken(email: string): Promise<boolean>;
  /** Always creates a regular user (never an administrator). */
  createUser(data: { email: string; displayName: string; kosmySub: string; globalRole: "USER" }): Promise<U>;
  setSub(userId: string, sub: string | null): Promise<void>;
}

export type ResolveResult<U> =
  | { ok: true; user: U; created: boolean }
  | { ok: false; error: "not_linked" | "inactive" | "email_taken" | "no_email" };

/** Sign-in: find the Kanby account linked to this Kosmy Board account, or (optionally) create one. */
export async function resolveKosmyAccount<U extends KosmyUser>(
  claims: KosmyClaims,
  options: { autoCreate: boolean },
  repo: KosmyAccountRepo<U>,
): Promise<ResolveResult<U>> {
  const linked = await repo.findBySub(claims.sub);
  if (linked) {
    return linked.active ? { ok: true, user: linked, created: false } : { ok: false, error: "inactive" };
  }

  if (!options.autoCreate) return { ok: false, error: "not_linked" };

  const email = (claims.email || claims.preferred_username || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "no_email" };
  // Never attach to (or take over) an existing account with the same email:
  // its owner must sign in with their password and link from their profile.
  if (await repo.emailTaken(email)) return { ok: false, error: "email_taken" };

  const displayName = (claims.name || email.split("@")[0]).slice(0, 80);
  const user = await repo.createUser({ email, displayName, kosmySub: claims.sub, globalRole: "USER" });
  return { ok: true, user, created: true };
}

export type LinkResult = { ok: true } | { ok: false; error: "already_linked" | "session" };

/** Link the Kosmy Board account `sub` to the signed-in Kanby user `userId`. */
export async function linkKosmyAccount(
  userId: string,
  sub: string,
  repo: Pick<KosmyAccountRepo, "findBySub" | "findById" | "setSub">,
): Promise<LinkResult> {
  const user = await repo.findById(userId);
  if (!user || !user.active) return { ok: false, error: "session" };
  const owner = await repo.findBySub(sub);
  if (owner && owner.id !== userId) return { ok: false, error: "already_linked" };
  if (user.kosmySub !== sub) await repo.setSub(userId, sub);
  return { ok: true };
}
