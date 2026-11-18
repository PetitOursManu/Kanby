import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Server-component guard for app pages.
 *  - not signed in → /login?next=<path>
 *  - must change password → /profile?mustChange=1 (except on the profile page)
 *  - admin-only page and not admin → /boards
 */
export async function requirePageUser(opts: { path: string; admin?: boolean; allowMustChange?: boolean }): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(opts.path)}`);
  if (user.mustChangePwd && !opts.allowMustChange) redirect("/profile?mustChange=1");
  if (opts.admin && user.globalRole !== "ADMIN") redirect("/boards");
  return user;
}
