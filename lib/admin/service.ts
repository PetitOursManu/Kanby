/**
 * Administration of the instance: the rules shared by Kanby's own admin
 * (`/admin`, `/api/admin/**`) and the admin shown in Kosmy Board
 * (`/api/kosmy-board/admin/**`). Both call these functions, so the checks
 * (no self-demotion, password policy, unique email…) are the same everywhere.
 *
 * Errors are the French API messages (`api.*` in lib/i18n/fr.ts), translated
 * by the caller with `translateApiError`.
 */
import { prisma } from "@/lib/prisma";
import { hashPassword, isPasswordValid } from "@/lib/auth/passwords";
import { EMAIL_RE, LIMITS, text } from "@/lib/validation";

export type AdminResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409; error: string };

const fail = (status: 400 | 404 | 409, error: string) => ({ ok: false as const, status, error });

export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  globalRole: true,
  active: true,
  createdAt: true,
  _count: { select: { ownedBoards: true, apiTokens: true } },
} as const;

export type AdminStats = { users: number; boards: number; activeTasks: number; completedTasks: number };

export async function getAdminStats(): Promise<AdminStats> {
  const [users, boards, activeTasks, completedTasks] = await Promise.all([
    prisma.user.count(),
    prisma.board.count(),
    prisma.card.count({ where: { completedAt: null } }),
    prisma.card.count({ where: { completedAt: { not: null } } }),
  ]);
  return { users, boards, activeTasks, completedTasks };
}

/** Every account, newest first. Never includes password hashes or tokens. */
export function listAdminUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: ADMIN_USER_SELECT });
}

/** Every board, most recently updated first. */
export function listAdminBoards() {
  return prisma.board.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      _count: { select: { cards: true, members: true } },
    },
  });
}

export type AdminUserRow = Awaited<ReturnType<typeof listAdminUsers>>[number];
export type AdminBoardRow = Awaited<ReturnType<typeof listAdminBoards>>[number];

export type CreateUserInput = { email?: unknown; displayName?: unknown; password?: unknown; globalRole?: unknown };

/** Create an account with a temporary password (changed at first sign-in). */
export async function createUserAsAdmin(input: CreateUserInput): Promise<AdminResult<AdminUserRow>> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = text(input.displayName, LIMITS.displayName, { required: true });
  const password = typeof input.password === "string" ? input.password : "";

  if (!email || displayName.error || !password) return fail(400, "email, displayName et password requis");
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) return fail(400, "Email invalide");
  if (!isPasswordValid(password)) return fail(400, "Le mot de passe doit faire au moins 8 caractères");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail(409, "Un compte existe déjà avec cet email");

  const user = await prisma.user.create({
    data: {
      email,
      displayName: displayName.value!,
      passwordHash: await hashPassword(password),
      globalRole: input.globalRole === "ADMIN" ? "ADMIN" : "USER",
      mustChangePwd: true,
    },
    select: ADMIN_USER_SELECT,
  });
  return { ok: true, value: user };
}

export type UpdateUserInput = { userId?: unknown; active?: unknown; globalRole?: unknown; password?: unknown };

/**
 * Update an account:
 *  - active: enable / disable the account (never yourself)
 *  - globalRole: "USER" | "ADMIN" (you can't demote yourself)
 *  - password: set a temporary password; the user must change it at next login
 */
export async function updateUserAsAdmin(actorId: string, input: UpdateUserInput): Promise<AdminResult<AdminUserRow>> {
  if (typeof input.userId !== "string") return fail(400, "userId requis");

  const target = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!target) return fail(404, "Utilisateur introuvable");
  const self = target.id === actorId;

  const data: { active?: boolean; globalRole?: "USER" | "ADMIN"; passwordHash?: string; mustChangePwd?: boolean } = {};
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return fail(400, "active invalide");
    if (self && !input.active) return fail(400, "Vous ne pouvez pas vous désactiver");
    data.active = input.active;
  }
  if (input.globalRole !== undefined) {
    if (input.globalRole !== "USER" && input.globalRole !== "ADMIN") return fail(400, "Rôle invalide");
    if (self && input.globalRole !== "ADMIN") return fail(400, "Vous ne pouvez pas retirer vos propres droits d'administration");
    data.globalRole = input.globalRole;
  }
  if (input.password !== undefined) {
    if (typeof input.password !== "string" || !isPasswordValid(input.password)) {
      return fail(400, "Le mot de passe doit faire au moins 8 caractères");
    }
    data.passwordHash = await hashPassword(input.password);
    data.mustChangePwd = true;
  }
  if (Object.keys(data).length === 0) return fail(400, "Rien à modifier");

  const user = await prisma.user.update({ where: { id: target.id }, data, select: ADMIN_USER_SELECT });
  return { ok: true, value: user };
}

/** Delete an account and everything it owns (boards, comments, tokens). Never yourself. */
export async function deleteUserAsAdmin(actorId: string, userId: string): Promise<AdminResult<null>> {
  if (userId === actorId) return fail(400, "Vous ne pouvez pas supprimer votre propre compte");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return fail(404, "Utilisateur introuvable");
  await prisma.user.delete({ where: { id: userId } });
  return { ok: true, value: null };
}
