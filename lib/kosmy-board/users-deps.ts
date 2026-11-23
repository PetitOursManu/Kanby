/**
 * Real dependencies of the users managed by Kosmy Board (kosmy.board-users.v1):
 * the same token checks as the admin in the Board (settings, discovery / JWKS
 * cache, `sub` → account link, single-use `jti`), and the Prisma accounts.
 */
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { boardAdminDeps } from "@/lib/kosmy-board/admin-deps";
import { unusablePasswordHash } from "@/lib/kosmy-board/server";
import type { BoardUsersDeps, UsersStore } from "@/lib/kosmy-board/users";

export const prismaUsersStore: UsersStore<User> = {
  findBySub: (sub) => prisma.user.findUnique({ where: { kosmySub: sub } }),
  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  listLinked: (limit) => prisma.user.findMany({ where: { kosmySub: { not: null } }, orderBy: { createdAt: "asc" }, take: limit }),
  countActiveAdmins: () => prisma.user.count({ where: { globalRole: "ADMIN", active: true } }),
  // No usable password: the account signs in through Kosmy Board.
  create: async (data) => prisma.user.create({ data: { ...data, passwordHash: await unusablePasswordHash(), mustChangePwd: false } }),
  update: (id, data) => prisma.user.update({ where: { id }, data }),
};

export const boardUsersDeps: BoardUsersDeps = {
  getSettings: boardAdminDeps.getSettings,
  discover: boardAdminDeps.discover,
  findUserBySub: boardAdminDeps.findUserBySub,
  // Same cache as the admin: a token is accepted only once, whatever the address.
  jti: boardAdminDeps.jti,
  users: prismaUsersStore,
};
