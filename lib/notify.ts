import { prisma } from "@/lib/prisma";
import { getTranslator, parseLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n";
import type { NextRequest } from "next/server";

/**
 * Notifications are written in each recipient's own language (User.locale,
 * saved when they pick a language). Users who never picked one get the
 * actor's language. Notifications are best-effort: a failure here never
 * breaks the action that triggered it.
 */
type Vars = Record<string, string>;

async function buildMessages(opts: {
  req?: NextRequest;
  recipients: { id: string; locale: string | null }[];
  actorId: string;
  boardId?: string;
  messageKey: string;
  vars?: Vars;
}) {
  const fallback = parseLocale(opts.req?.cookies?.get(LOCALE_COOKIE)?.value);
  const [actor, board] = await Promise.all([
    prisma.user.findUnique({ where: { id: opts.actorId }, select: { displayName: true } }),
    opts.boardId ? prisma.board.findUnique({ where: { id: opts.boardId }, select: { name: true } }) : null,
  ]);
  const cache = new Map<Locale, string>();
  return opts.recipients.map((r) => {
    const locale = r.locale ? parseLocale(r.locale) : fallback;
    if (!cache.has(locale)) {
      cache.set(
        locale,
        getTranslator(locale)(opts.messageKey, {
          actor: actor?.displayName ?? "?",
          board: board?.name ?? "",
          card: opts.vars?.card ?? "",
          ...opts.vars,
        }),
      );
    }
    return { userId: r.id, message: cache.get(locale)! };
  });
}

/** Notify every member of a team board except the actor. */
export async function notifyBoardMembers(opts: {
  req?: NextRequest;
  boardId: string;
  actorId: string;
  cardId?: string;
  kind: string;
  messageKey: string;
  vars?: Vars;
}): Promise<void> {
  try {
    const board = await prisma.board.findUnique({ where: { id: opts.boardId }, select: { type: true } });
    if (!board || board.type !== "TEAM") return;

    const members = await prisma.boardMember.findMany({
      where: { boardId: opts.boardId, userId: { not: opts.actorId }, user: { active: true } },
      select: { user: { select: { id: true, locale: true } } },
    });
    if (members.length === 0) return;

    const messages = await buildMessages({ ...opts, recipients: members.map((m) => m.user) });
    await prisma.notification.createMany({
      data: messages.map((m) => ({
        userId: m.userId,
        actorId: opts.actorId,
        boardId: opts.boardId,
        cardId: opts.cardId ?? null,
        kind: opts.kind,
        message: m.message,
      })),
    });
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}

/** Notify a single user (e.g. when assigned to a card or added to a board). */
export async function notifyUser(opts: {
  req?: NextRequest;
  userId: string;
  actorId: string;
  boardId?: string;
  cardId?: string;
  kind: string;
  messageKey: string;
  vars?: Vars;
}): Promise<void> {
  if (opts.userId === opts.actorId) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { id: true, locale: true } });
    if (!user) return;
    const [m] = await buildMessages({ ...opts, recipients: [user] });
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        actorId: opts.actorId,
        boardId: opts.boardId ?? null,
        cardId: opts.cardId ?? null,
        kind: opts.kind,
        message: m.message,
      },
    });
  } catch (e) {
    console.error("[notify] failed:", e);
  }
}
