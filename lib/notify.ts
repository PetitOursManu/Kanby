import { prisma } from "@/lib/prisma";
import { getTranslator, parseLocale, LOCALE_COOKIE } from "@/lib/i18n";
import type { NextRequest } from "next/server";

/**
 * Create notifications for all members of a team board (except the actor)
 * when a board-level event happens.
 *
 * The message is localized for each recipient using their cookie locale —
 * since we don't store a per-user locale, we fall back to the actor's locale
 * (the request cookie). In practice all members share the same instance
 * locale most of the time.
 */
export async function notifyBoardMembers(opts: {
  req?: NextRequest;
  boardId: string;
  actorId: string;
  cardId?: string;
  kind: string;
  /** Translation key for the message. Variables: {actor}, {board}, {card}. */
  messageKey: string;
  vars?: Record<string, string>;
}): Promise<void> {
  const { req, boardId, actorId, cardId, kind, messageKey, vars } = opts;

  // Only team boards have members to notify.
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { type: true, name: true, ownerId: true },
  });
  if (!board || board.type !== "TEAM") return;

  const members = await prisma.boardMember.findMany({
    where: { boardId },
    select: { userId: true },
  });

  // Recipients: all members except the actor.
  const recipients = members
    .map((m) => m.userId)
    .filter((uid) => uid !== actorId);
  if (recipients.length === 0) return;

  const actorLocale = parseLocale(req?.cookies?.get(LOCALE_COOKIE)?.value);
  const t = getTranslator(actorLocale);
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { displayName: true },
  });
  const message = t(messageKey, {
    actor: actor?.displayName ?? "?",
    board: board.name,
    card: vars?.card ?? "",
    ...vars,
  });

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      actorId,
      boardId,
      cardId: cardId ?? null,
      kind,
      message,
    })),
  });
}

/** Notify a single user (e.g. when assigned to a card). */
export async function notifyUser(opts: {
  req?: NextRequest;
  userId: string;
  actorId: string;
  boardId?: string;
  cardId?: string;
  kind: string;
  messageKey: string;
  vars?: Record<string, string>;
}): Promise<void> {
  const { req, userId, actorId, boardId, cardId, kind, messageKey, vars } = opts;
  if (userId === actorId) return;

  const actorLocale = parseLocale(req?.cookies?.get(LOCALE_COOKIE)?.value);
  const t = getTranslator(actorLocale);
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { displayName: true },
  });
  let boardName = "";
  if (boardId) {
    const b = await prisma.board.findUnique({ where: { id: boardId }, select: { name: true } });
    boardName = b?.name ?? "";
  }
  const message = t(messageKey, {
    actor: actor?.displayName ?? "?",
    board: boardName,
    card: vars?.card ?? "",
    ...vars,
  });

  await prisma.notification.create({
    data: {
      userId,
      actorId,
      boardId: boardId ?? null,
      cardId: cardId ?? null,
      kind,
      message,
    },
  });
}