/**
 * Per-user restrictions set by an administrator (from Kosmy Board, protocol
 * kosmy.board-users.v1, fields `maxBoards` and `canUseApi`). They only apply
 * to regular users: administrators are never restricted.
 */
import type { GlobalRole } from "@prisma/client";

type Restricted = { globalRole: GlobalRole; maxBoards: number | null; canUseApi: boolean };

/** May this user use API tokens (mobile API, widget)? */
export function mayUseApi(user: Restricted): boolean {
  return user.globalRole === "ADMIN" || user.canUseApi;
}

/**
 * Most boards this user may own, or null for no limit.
 * 0 = cannot create boards (they can still be invited to team boards).
 */
export function boardLimit(user: Restricted): number | null {
  return user.globalRole === "ADMIN" ? null : user.maxBoards;
}
