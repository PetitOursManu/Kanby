import { describe, it, expect, afterAll } from "vitest";
import { api, createUser, createBoard, addMember, createCard, cardOrder, prisma } from "./helpers";

afterAll(() => prisma.$disconnect());

describe("columns", () => {
  it("members add columns at the end; outsiders cannot", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const { board } = await createBoard(owner);
    const r = await api("/api/columns", { as: owner, body: { boardId: board.id, name: "Review", kind: "DOING" } });
    expect(r.status).toBe(201);
    expect(r.json.column.order).toBe(3);
    expect(r.json.column.cards).toEqual([]);
    expect((await api("/api/columns", { as: outsider, body: { boardId: board.id, name: "x" } })).status).toBe(403);
    expect((await api("/api/columns", { as: owner, body: { boardId: board.id, name: "" } })).status).toBe(400);
  });

  it("renames, recolors and validates colors", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const c = columns[0];
    expect((await api(`/api/columns/${c.id}`, { as: owner, method: "PATCH", body: { name: "Inbox", color: "#10b981" } })).json.column).toMatchObject({ name: "Inbox", color: "#10b981" });
    expect((await api(`/api/columns/${c.id}`, { as: owner, method: "PATCH", body: { color: "red; background:url(x)" } })).status).toBe(400);
    expect((await api(`/api/columns/${c.id}`, { as: owner, method: "PATCH", body: { color: null } })).json.column.color).toBeNull();
  });

  it("moving a column to an index reorders all columns consistently", async () => {
    const owner = await createUser();
    const { board, columns } = await createBoard(owner);
    // Move "Done" (index 2) to the front.
    const r = await api(`/api/columns/${columns[2].id}`, { as: owner, method: "PATCH", body: { order: 0 } });
    expect(r.status).toBe(200);
    const db = await prisma.column.findMany({ where: { boardId: board.id }, orderBy: { order: "asc" } });
    expect(db.map((c) => c.id)).toEqual([columns[2].id, columns[0].id, columns[1].id]);
    expect(db.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it("only the owner deletes a column, and its cards go with it", async () => {
    const owner = await createUser();
    const member = await createUser();
    const { board, columns } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, member);
    const card = await createCard(owner, columns[0].id);
    expect((await api(`/api/columns/${columns[0].id}`, { as: member, method: "DELETE" })).status).toBe(403);
    expect((await api(`/api/columns/${columns[0].id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    expect(await prisma.card.findUnique({ where: { id: card.id } })).toBeNull();
    const left = await prisma.column.findMany({ where: { boardId: board.id }, orderBy: { order: "asc" } });
    expect(left.map((c) => c.order)).toEqual([0, 1]);
  });

  it("changing a column's kind updates completion of its cards", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const card = await createCard(owner, columns[0].id);
    await api(`/api/columns/${columns[0].id}`, { as: owner, method: "PATCH", body: { kind: "DONE" } });
    expect((await prisma.card.findUnique({ where: { id: card.id } }))?.completedAt).not.toBeNull();
    await api(`/api/columns/${columns[0].id}`, { as: owner, method: "PATCH", body: { kind: "TODO" } });
    expect((await prisma.card.findUnique({ where: { id: card.id } }))?.completedAt).toBeNull();
  });
});

describe("cards", () => {
  it("creates cards at the end of the column", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const a = await createCard(owner, columns[0].id, "A");
    const b = await createCard(owner, columns[0].id, "B");
    expect([a.order, b.order]).toEqual([0, 1]);
    expect((await api("/api/cards", { as: owner, body: { columnId: columns[0].id, title: " " } })).status).toBe(400);
    expect((await api("/api/cards", { as: owner, body: { columnId: columns[0].id, title: "x".repeat(600) } })).status).toBe(400);
  });

  it("creating a card directly in a DONE column marks it completed", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const c = await createCard(owner, columns[2].id);
    expect(c.completedAt).not.toBeNull();
  });

  it("returns full details and edits title / description / due date", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const card = await createCard(owner, columns[0].id);
    const p = await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { title: "T2", description: "desc", dueDate: "2030-01-15" } });
    expect(p.status).toBe(200);
    const g = await api(`/api/cards/${card.id}`, { as: owner });
    expect(g.json.card).toMatchObject({ title: "T2", description: "desc" });
    expect(g.json.card.dueDate).toContain("2030-01-15");
    expect((await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { dueDate: "not-a-date" } })).status).toBe(400);
    expect((await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { dueDate: null } })).status).toBe(200);
  });

  it("outsiders cannot read, edit or delete cards", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const { columns } = await createBoard(owner);
    const card = await createCard(owner, columns[0].id);
    expect((await api(`/api/cards/${card.id}`, { as: outsider })).status).toBe(403);
    expect((await api(`/api/cards/${card.id}`, { as: outsider, method: "PATCH", body: { title: "x" } })).status).toBe(403);
    expect((await api(`/api/cards/${card.id}`, { as: outsider, method: "DELETE" })).status).toBe(403);
    expect((await api("/api/cards", { as: outsider, body: { columnId: columns[0].id, title: "x" } })).status).toBe(403);
  });

  it("cannot move a card into another board's column", async () => {
    const owner = await createUser();
    const victim = await createUser();
    const { columns } = await createBoard(owner);
    const { columns: victimCols } = await createBoard(victim);
    const card = await createCard(owner, columns[0].id);
    const r = await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { columnId: victimCols[0].id } });
    expect(r.status).toBe(400);
    expect(await prisma.card.count({ where: { columnId: victimCols[0].id } })).toBe(0);
  });

  it("reorders within a column and persists every card's position", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const col = columns[0].id;
    const a = await createCard(owner, col, "A");
    await createCard(owner, col, "B");
    await createCard(owner, col, "C");
    // Move A between B and C (index 1).
    const r = await api(`/api/cards/${a.id}/move`, { as: owner, body: { columnId: col, index: 1 } });
    expect(r.status).toBe(200);
    expect(await cardOrder(col)).toEqual(["B", "A", "C"]);
    // Move A to the top.
    await api(`/api/cards/${a.id}/move`, { as: owner, body: { columnId: col, index: 0 } });
    expect(await cardOrder(col)).toEqual(["A", "B", "C"]);
    const orders = (await prisma.card.findMany({ where: { columnId: col }, orderBy: { order: "asc" } })).map((c) => c.order);
    expect(orders).toEqual([0, 1, 2]);
  });

  it("moves across columns, reindexes both columns and sets completion", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const [todo, , done] = columns;
    const a = await createCard(owner, todo.id, "A");
    await createCard(owner, todo.id, "B");
    await createCard(owner, done.id, "X");
    await createCard(owner, done.id, "Y");
    const r = await api(`/api/cards/${a.id}/move`, { as: owner, body: { columnId: done.id, index: 1 } });
    expect(r.status).toBe(200);
    expect(await cardOrder(todo.id)).toEqual(["B"]);
    expect(await cardOrder(done.id)).toEqual(["X", "A", "Y"]);
    expect((await prisma.card.findUnique({ where: { id: a.id } }))?.completedAt).not.toBeNull();
    // Back to todo clears completion.
    await api(`/api/cards/${a.id}/move`, { as: owner, body: { columnId: todo.id, index: 5 } });
    expect(await cardOrder(todo.id)).toEqual(["B", "A"]);
    expect((await prisma.card.findUnique({ where: { id: a.id } }))?.completedAt).toBeNull();
  });

  it("PATCH with columnId/order (legacy API) uses the same safe move", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const a = await createCard(owner, columns[0].id, "A");
    await createCard(owner, columns[1].id, "B");
    await api(`/api/cards/${a.id}`, { as: owner, method: "PATCH", body: { columnId: columns[1].id, order: 0 } });
    expect(await cardOrder(columns[1].id)).toEqual(["A", "B"]);
  });

  it("reordering inside a DONE column keeps the original completion date", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const a = await createCard(owner, columns[2].id, "A");
    await createCard(owner, columns[2].id, "B");
    const before = (await prisma.card.findUnique({ where: { id: a.id } }))?.completedAt;
    await new Promise((r) => setTimeout(r, 20));
    await api(`/api/cards/${a.id}/move`, { as: owner, body: { columnId: columns[2].id, index: 1 } });
    const after = (await prisma.card.findUnique({ where: { id: a.id } }))?.completedAt;
    expect(after?.getTime()).toBe(before?.getTime());
  });

  it("deleting a card closes the gap in its column", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const a = await createCard(owner, columns[0].id, "A");
    await createCard(owner, columns[0].id, "B");
    expect((await api(`/api/cards/${a.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    const left = await prisma.card.findMany({ where: { columnId: columns[0].id } });
    expect(left.map((c) => c.order)).toEqual([0]);
  });
});

describe("assignment", () => {
  it("assigns board members only, and notifies them", async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const { board, columns } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, member);
    const card = await createCard(owner, columns[0].id, "Task");
    expect((await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: outsider.id } })).status).toBe(400);
    expect((await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: "nope" } })).status).toBe(400);
    const r = await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: member.id } });
    expect(r.status).toBe(200);
    expect(r.json.card.assignee.id).toBe(member.id);
    const n = await api("/api/notifications", { as: member });
    expect(n.json.notifications.some((x: any) => x.kind === "card_assigned")).toBe(true);
    const clear = await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: null } });
    expect(clear.json.card.assignee).toBeNull();
  });

  it("the owner of a personal board can assign themself", async () => {
    const owner = await createUser();
    const { columns } = await createBoard(owner);
    const card = await createCard(owner, columns[0].id);
    expect((await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: owner.id } })).status).toBe(200);
  });
});

describe("labels", () => {
  it("creates labels with palette colors only", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner);
    expect((await api("/api/labels", { as: owner, body: { boardId: board.id, name: "Bug", color: "#f43f5e" } })).status).toBe(201);
    expect((await api("/api/labels", { as: owner, body: { boardId: board.id, name: "Bug", color: "#123456" } })).status).toBe(400);
  });

  it("toggles a label on a card; rejects labels of other boards", async () => {
    const owner = await createUser();
    const { board, columns } = await createBoard(owner);
    const { board: other } = await createBoard(owner);
    const card = await createCard(owner, columns[0].id);
    const label = (await api("/api/labels", { as: owner, body: { boardId: board.id, name: "Bug", color: "#f43f5e" } })).json.label;
    const foreign = (await api("/api/labels", { as: owner, body: { boardId: other.id, name: "X", color: "#f43f5e" } })).json.label;
    expect((await api(`/api/cards/${card.id}/labels`, { as: owner, body: { labelId: label.id } })).json.attached).toBe(true);
    expect((await api(`/api/cards/${card.id}/labels`, { as: owner, body: { labelId: label.id } })).json.attached).toBe(false);
    expect((await api(`/api/cards/${card.id}/labels`, { as: owner, body: { labelId: foreign.id } })).status).toBe(400);
    expect((await api(`/api/cards/${card.id}/labels`, { as: owner, body: { labelId: "nope" } })).status).toBe(400);
  });

  it("members edit labels, only the owner deletes them", async () => {
    const owner = await createUser();
    const member = await createUser();
    const { board } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, member);
    const label = (await api("/api/labels", { as: owner, body: { boardId: board.id, name: "Bug", color: "#f43f5e" } })).json.label;
    expect((await api(`/api/labels/${label.id}`, { as: member, method: "PATCH", body: { name: "Bugs" } })).json.label.name).toBe("Bugs");
    expect((await api(`/api/labels/${label.id}`, { as: member, method: "DELETE" })).status).toBe(403);
    expect((await api(`/api/labels/${label.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
  });
});

describe("checklist", () => {
  it("adds, toggles, renames and deletes items", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const { columns } = await createBoard(owner);
    const card = await createCard(owner, columns[0].id);
    const item = (await api("/api/checklist", { as: owner, body: { cardId: card.id, text: "Step" } })).json.item;
    expect(item.done).toBe(false);
    expect((await api(`/api/checklist/${item.id}`, { as: owner, method: "PATCH", body: { done: true, text: "Step 1" } })).json.item).toMatchObject({ done: true, text: "Step 1" });
    expect((await api(`/api/checklist/${item.id}`, { as: outsider, method: "PATCH", body: { done: false } })).status).toBe(403);
    expect((await api("/api/checklist", { as: outsider, body: { cardId: card.id, text: "x" } })).status).toBe(403);
    expect((await api(`/api/checklist/${item.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
  });
});

describe("comments & notifications", () => {
  it("comments notify other team members; authors and owners can delete", async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();
    const { board, columns } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, a);
    await addMember(owner, board.id, b);
    const card = await createCard(owner, columns[0].id, "Discuss");
    const c = (await api("/api/comments", { as: a, body: { cardId: card.id, text: "Hello" } })).json.comment;
    expect(c.author.id).toBe(a.id);
    const nb = await api("/api/notifications", { as: b });
    expect(nb.json.unreadCount).toBeGreaterThan(0);
    expect(nb.json.notifications.some((x: any) => x.kind === "card_commented")).toBe(true);
    // The author is never notified of their own action.
    const na = await api("/api/notifications?unreadOnly=true", { as: a });
    expect(na.json.notifications.some((x: any) => x.kind === "card_commented")).toBe(false);
    expect((await api(`/api/comments/${c.id}`, { as: b, method: "DELETE" })).status).toBe(403);
    expect((await api(`/api/comments/${c.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    expect((await api("/api/comments", { as: a, body: { cardId: card.id, text: "  " } })).status).toBe(400);
  });

  it("marks one or all notifications as read, never someone else's", async () => {
    const owner = await createUser();
    const a = await createUser();
    const { board, columns } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, a);
    const card = await createCard(owner, columns[0].id);
    await api("/api/comments", { as: owner, body: { cardId: card.id, text: "1" } });
    await api("/api/comments", { as: owner, body: { cardId: card.id, text: "2" } });
    const list = (await api("/api/notifications", { as: a })).json;
    const first = list.notifications[0];
    await api("/api/notifications", { as: owner, body: { id: first.id } });
    expect((await prisma.notification.findUnique({ where: { id: first.id } }))?.read).toBe(false);
    await api("/api/notifications", { as: a, body: { id: first.id } });
    expect((await prisma.notification.findUnique({ where: { id: first.id } }))?.read).toBe(true);
    await api("/api/notifications", { as: a, body: {} });
    expect((await api("/api/notifications", { as: a })).json.unreadCount).toBe(0);
  });
});

describe("user search", () => {
  it("needs 2 chars, excludes self and inactive users", async () => {
    const tag = "Zorg" + Math.random().toString(36).slice(2, 7);
    const me = await createUser({ name: `${tag} Alpha` });
    await createUser({ name: `${tag} Beta` });
    await createUser({ name: `${tag} Gamma`, active: false });
    expect((await api("/api/users/search?q=Z", { as: me })).json.users).toEqual([]);
    const r = await api(`/api/users/search?q=${tag.toLowerCase()}`, { as: me });
    const names = r.json.users.map((u: any) => u.displayName);
    expect(names).toEqual([`${tag} Beta`]);
  });
});

describe("task importance (priority)", () => {
  it("defaults to 0, can be set at creation and changed, from 0 to 4", async () => {
    const u = await createUser();
    const { columns } = await createBoard(u);
    const card = await createCard(u, columns[0].id, "Plain");
    expect(card.priority).toBe(0);

    const urgent = await api("/api/cards", { as: u, body: { columnId: columns[0].id, title: "Urgent", priority: 4 } });
    expect(urgent.status).toBe(201);
    expect(urgent.json.card.priority).toBe(4);

    const r = await api(`/api/cards/${card.id}`, { as: u, method: "PATCH", body: { priority: 3 } });
    expect(r.json.card.priority).toBe(3);
    expect((await api(`/api/cards/${card.id}`, { as: u, method: "PATCH", body: { priority: null } })).json.card.priority).toBe(0);

    for (const bad of [5, -1, 1.5, "2"]) {
      expect((await api(`/api/cards/${card.id}`, { as: u, method: "PATCH", body: { priority: bad } })).status).toBe(400);
    }
    expect((await api("/api/cards", { as: u, body: { columnId: columns[0].id, title: "X", priority: 9 } })).status).toBe(400);
  });

  it("is kept when the task is transferred to another day", async () => {
    const u = await createUser();
    const { board } = await createBoard(u, "PERSONAL", "Elisa30");
    const day = (await api(`/api/boards/${board.id}/calendar`, { as: u, body: { period: "DAY", date: "2026-11-24" } })).json.board;
    const cols = (await api(`/api/boards/${day.id}`, { as: u })).json.board.columns;
    const card = (await api("/api/cards", { as: u, body: { columnId: cols[0].id, title: "Plonge", priority: 3 } })).json.card;
    const r = await api(`/api/cards/${card.id}/transfer`, { as: u, body: { date: "2026-11-25" } });
    expect(r.json.card.priority).toBe(3);
  });
});
