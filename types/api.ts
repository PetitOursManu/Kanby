import type { Board, BoardMember, BoardRole, BoardType, Card, Column, ColumnKind, Comment, GlobalRole, Label, User } from "@prisma/client";

export type MemberUser = { id: string; displayName: string; email: string; avatarUrl: string | null };
export type Assignee = { id: string; displayName: string; avatarUrl: string | null };

export type CardLabelRow = { label: Label };
export type CardRow = Card & {
  labels: CardLabelRow[];
  assignee: Assignee | null;
  checklist: { done: boolean }[];
  _count: { checklist: number; comments: number };
};

export type ColumnRow = Column & { cards: CardRow[] };

export type MemberRow = BoardMember & { user: MemberUser };

export type BoardData = Board & {
  columns: ColumnRow[];
  labels: Label[];
  members: MemberRow[];
  owner: MemberUser;
};

export type CurrentUser = {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
};

export type CardDetail = Card & {
  labels: CardLabelRow[];
  checklist: { id: string; text: string; done: boolean; order: number }[];
  comments: (Comment & { author: Assignee })[];
  assignee: Assignee | null;
  column: { id: string; name: string; kind: ColumnKind };
};

export const isDoneColumn = (kind: ColumnKind) => kind === "DONE";

export type { BoardRole, BoardType, ColumnKind, GlobalRole, User };