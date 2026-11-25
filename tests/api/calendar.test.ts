import { describe, it, expect, afterAll } from "vitest";
import { api, createUser, createBoard, addMember, createCard, prisma } from "./helpers";

afterAll(() => prisma.$disconnect());

const open = (as: any, boardId: string, period: string, date: string) =>
  api(`/api/boards/${boardId}/calendar`, { body: { period, date }, headers: { cookie: `${as.cookie}; kanby_locale=fr` } });

describe("calendar (one board per day / per week)", () => {
  it("creates a day board named automatically, with the board's columns and labels", async () => {
    const owner = await createUser();
    const { board, columns } = await createBoard(owner, "PERSONAL", "Elisa30");
    await api("/api/columns", { as: owner, body: { boardId: board.id, name: "Bloqué", kind: "TODO" } });
    await api("/api/labels", { as: owner, body: { boardId: board.id, name: "Urgent", color: "#f43f5e" } });
    await createCard(owner, columns[0].id, "Not copied");

    const r = await open(owner, board.id, "DAY", "2026-11-24");
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(true);
    const day = r.json.board;
    expect(day.name).toBe("Elisa30 — Mardi 24 novembre 2026");
    expect(day.parentId).toBe(board.id);
    expect(day.period).toBe("DAY");
    expect(day.ownerId).toBe(owner.id);

    const full = await api(`/api/boards/${day.id}`, { as: owner });
    expect(full.json.board.columns.map((c: any) => c.name)).toEqual(["À faire", "En cours", "Terminé", "Bloqué"]);
    expect(full.json.board.columns.flatMap((c: any) => c.cards)).toHaveLength(0);
    expect(full.json.board.labels.map((l: any) => l.name)).toEqual(["Urgent"]);

    // Opening the same day again returns the same board.
    const again = await open(owner, board.id, "DAY", "2026-11-24");
    expect(again.status).toBe(200);
    expect(again.json.board.id).toBe(day.id);
  });

  it("creates one week board per week, starting on Monday", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const r = await open(owner, board.id, "WEEK", "2026-11-26"); // Thursday
    expect(r.status).toBe(201);
    expect(r.json.board.name).toBe("Elisa30 — Semaine 48 · 23 → 29 nov. 2026");
    const sunday = await open(owner, board.id, "WEEK", "2026-11-29");
    expect(sunday.json.board.id).toBe(r.json.board.id);
  });

  it("lists the calendar, and keeps day boards out of the board list", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const d1 = (await open(owner, board.id, "DAY", "2026-11-02")).json.board;
    await open(owner, board.id, "DAY", "2026-12-15");
    const w = (await open(owner, board.id, "WEEK", "2026-11-02")).json.board;
    const cols = (await api(`/api/boards/${d1.id}`, { as: owner })).json.board.columns;
    await createCard(owner, cols[0].id, "A");
    const done = await createCard(owner, cols[0].id, "B");
    await api(`/api/cards/${done.id}/move`, { as: owner, method: "POST", body: { columnId: cols[2].id, index: 0 } });

    const r = await api(`/api/boards/${board.id}/calendar?from=2026-11-01&to=2026-11-30`, { as: owner });
    expect(r.status).toBe(200);
    expect(r.json.boards.map((b: any) => `${b.period} ${b.date}`).sort()).toEqual(["DAY 2026-11-02", "WEEK 2026-11-02"]);
    const day = r.json.boards.find((b: any) => b.id === d1.id);
    expect(day).toMatchObject({ cardsCount: 2, doneCount: 1 });
    expect(r.json.boards.map((b: any) => b.id)).toContain(w.id);

    const list = await api("/api/boards", { as: owner });
    expect(list.json.owned.map((b: any) => b.id)).toEqual([board.id]);
  });

  it("validates the period, the date and the range", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner);
    expect((await open(owner, board.id, "MONTH", "2026-11-24")).status).toBe(400);
    expect((await open(owner, board.id, "DAY", "2026-02-30")).status).toBe(400);
    expect((await open(owner, board.id, "DAY", "")).status).toBe(400);
    expect((await api(`/api/boards/${board.id}/calendar?from=2026-12-01&to=2026-11-01`, { as: owner })).status).toBe(400);
    expect((await api(`/api/boards/${board.id}/calendar?from=2020-01-01&to=2026-11-01`, { as: owner })).status).toBe(400);
    // No calendar inside a calendar.
    const day = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    expect((await open(owner, day.id, "DAY", "2026-11-25")).status).toBe(400);
    expect((await api(`/api/boards/${day.id}`, { as: owner, method: "PATCH", body: { type: "TEAM" } })).status).toBe(400);
  });

  it("is reserved to members; admins can read it", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const { board } = await createBoard(owner);
    expect((await open(outsider, board.id, "DAY", "2026-11-24")).status).toBe(403);
    expect((await api(`/api/boards/${board.id}/calendar`, { as: outsider })).status).toBe(403);
    expect((await api(`/api/boards/${board.id}/calendar`, { as: admin })).status).toBe(200);
    expect((await open(admin, board.id, "DAY", "2026-11-24")).status).toBe(403);
  });

  it("shares members and type with the day boards of a team board", async () => {
    const owner = await createUser();
    const alice = await createUser();
    const bob = await createUser();
    const { board } = await createBoard(owner, "TEAM", "Équipe");
    await addMember(owner, board.id, alice);

    // A member can create a day board; it has the same members.
    const day = (await open(alice, board.id, "DAY", "2026-11-24")).json.board;
    expect(day.type).toBe("TEAM");
    expect((await api(`/api/boards/${day.id}`, { as: alice })).status).toBe(200);

    // Inviting on the main board gives access to the existing day boards.
    await addMember(owner, board.id, bob);
    expect((await api(`/api/boards/${day.id}`, { as: bob })).status).toBe(200);

    // Removing from a day board removes from the whole calendar, assignments included.
    const cols = (await api(`/api/boards/${day.id}`, { as: owner })).json.board.columns;
    const card = await createCard(owner, cols[0].id, "Assigned");
    await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: bob.id } });
    expect((await prisma.card.findUnique({ where: { id: card.id } }))!.assigneeId).toBe(bob.id);
    expect((await api(`/api/boards/${day.id}/members?userId=${bob.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    expect((await api(`/api/boards/${board.id}`, { as: bob })).status).toBe(403);
    expect((await api(`/api/boards/${day.id}`, { as: bob })).status).toBe(403);
    expect((await prisma.card.findUnique({ where: { id: card.id } }))!.assigneeId).toBeNull();

    // Making the main board personal makes its calendar private too.
    expect((await api(`/api/boards/${board.id}`, { as: owner, method: "PATCH", body: { type: "PERSONAL" } })).status).toBe(200);
    expect((await prisma.board.findUnique({ where: { id: day.id } }))!.type).toBe("PERSONAL");
    expect((await api(`/api/boards/${day.id}`, { as: alice })).status).toBe(403);
  });

  it("deletes the calendar with its board, and day boards don't count toward maxBoards", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner);
    await prisma.user.update({ where: { id: owner.id }, data: { maxBoards: 1 } });
    const day = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    expect(day).toBeTruthy();
    expect((await open(owner, board.id, "DAY", "2026-11-25")).status).toBe(201);
    expect((await api("/api/boards", { as: owner, body: { name: "Second" } })).status).toBe(403);

    expect((await api(`/api/boards/${board.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    expect(await prisma.board.findUnique({ where: { id: day.id } })).toBeNull();
  });

  it("moves a day board to another day, renaming it", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const day = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    const cols = (await api(`/api/boards/${day.id}`, { as: owner })).json.board.columns;
    await createCard(owner, cols[0].id, "Keep me");

    const r = await api(`/api/boards/${day.id}/reschedule`, { as: owner, body: { date: "2026-12-03" } });
    expect(r.status).toBe(200);
    expect(r.json.board.id).toBe(day.id);
    expect(r.json.board.name).toBe("Elisa30 — Jeudi 3 décembre 2026");
    expect(r.json.board.periodStart.slice(0, 10)).toBe("2026-12-03");
    expect(r.json.swapped).toBeNull();
    expect(await prisma.card.count({ where: { boardId: day.id } })).toBe(1);

    // The old day is free again.
    expect((await open(owner, board.id, "DAY", "2026-11-24")).status).toBe(201);
  });

  it("refuses a taken day (409) unless asked to swap", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const a = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    const b = (await open(owner, board.id, "DAY", "2026-11-25")).json.board;
    await api(`/api/boards/${b.id}`, { as: owner, method: "PATCH", body: { name: "Soirée spéciale" } });

    const refused = await api(`/api/boards/${a.id}/reschedule`, { as: owner, body: { date: "2026-11-25" } });
    expect(refused.status).toBe(409);
    expect(refused.json.conflict).toEqual({ id: b.id, name: "Soirée spéciale" });

    const r = await api(`/api/boards/${a.id}/reschedule`, { as: owner, body: { date: "2026-11-25", swap: true } });
    expect(r.status).toBe(200);
    expect(r.json.board.name).toBe("Elisa30 — Mercredi 25 novembre 2026");
    expect(r.json.swapped.id).toBe(b.id);
    expect(r.json.swapped.name).toBe("Soirée spéciale"); // custom name kept
    const after = await prisma.board.findMany({ where: { parentId: board.id }, orderBy: { periodStart: "asc" } });
    expect(after.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("moves week boards by week, and checks access and input", async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const { board } = await createBoard(owner, "TEAM", "Elisa30");
    await addMember(owner, board.id, member);
    const w = (await open(owner, board.id, "WEEK", "2026-11-23")).json.board;

    // Any day of the target week; a member may move it.
    const r = await api(`/api/boards/${w.id}/reschedule`, { as: member, body: { date: "2026-12-04" } });
    expect(r.status).toBe(200);
    expect(r.json.board.periodStart.slice(0, 10)).toBe("2026-11-30");
    expect(r.json.board.name).toBe("Elisa30 — Semaine 49 · 30 nov. → 6 déc. 2026");
    // Same week: nothing to do.
    expect((await api(`/api/boards/${w.id}/reschedule`, { as: owner, body: { date: "2026-12-01" } })).status).toBe(200);

    expect((await api(`/api/boards/${w.id}/reschedule`, { as: outsider, body: { date: "2026-12-10" } })).status).toBe(403);
    expect((await api(`/api/boards/${w.id}/reschedule`, { as: owner, body: { date: "2026-13-01" } })).status).toBe(400);
    expect((await api(`/api/boards/${board.id}/reschedule`, { as: owner, body: { date: "2026-12-10" } })).status).toBe(400);
  });

  it("transfers yesterday's unfinished tasks to today, with their labels", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const y = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    const yb = (await api(`/api/boards/${y.id}`, { as: owner })).json.board;
    const label = (await api("/api/labels", { as: owner, body: { boardId: y.id, name: "Cuisine", color: "#f59e0b" } })).json.label;
    const a = await createCard(owner, yb.columns[0].id, "Plonge");
    const b = await createCard(owner, yb.columns[1].id, "Mise en place");
    const done = await createCard(owner, yb.columns[0].id, "Accueil");
    await api(`/api/cards/${done.id}/move`, { as: owner, body: { columnId: yb.columns[2].id, index: 0 } });
    await api(`/api/cards/${a.id}/labels`, { as: owner, body: { labelId: label.id } });
    await api("/api/checklist", { as: owner, body: { cardId: a.id, text: "Verres" } });

    const r = await api(`/api/boards/${y.id}/transfer`, { body: { date: "2026-11-25" }, headers: { cookie: `${owner.cookie}; kanby_locale=fr` } });
    expect(r.status).toBe(200);
    expect(r.json.board.name).toBe("Elisa30 — Mercredi 25 novembre 2026");
    expect(r.json.moved.sort()).toEqual([a.id, b.id].sort());

    const today = (await api(`/api/boards/${r.json.board.id}`, { as: owner })).json.board;
    const byCol = Object.fromEntries(today.columns.map((c: any) => [c.name, c.cards.map((x: any) => x.title)]));
    expect(byCol["À faire"]).toEqual(["Plonge"]);
    expect(byCol["En cours"]).toEqual(["Mise en place"]);
    const moved = today.columns[0].cards[0];
    expect(moved.labels.map((l: any) => l.label.name)).toEqual(["Cuisine"]);
    expect(moved.labels[0].label.boardId).toBe(today.id);
    expect(moved._count.checklist).toBe(1);

    // The finished task stays; yesterday's columns are compact again.
    const after = (await api(`/api/boards/${y.id}`, { as: owner })).json.board;
    expect(after.columns.flatMap((c: any) => c.cards.map((x: any) => x.title))).toEqual(["Accueil"]);

    // History: whole calendar, the day, and the task.
    const h = await api(`/api/boards/${board.id}/history`, { as: owner });
    const moves = h.json.items.filter((i: any) => i.kind === "CARD_MOVED");
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatchObject({ from: "2026-11-24", to: "2026-11-25", period: "DAY" });
    expect(moves[0].actor.id).toBe(owner.id);
    expect((await api(`/api/boards/${y.id}/history`, { as: owner })).json.items).toHaveLength(2);
    const hc = await api(`/api/boards/${today.id}/history?cardId=${a.id}`, { as: owner });
    expect(hc.json.items.map((i: any) => i.title)).toEqual(["Plonge"]);
  });

  it("transfers one task (or a choice of tasks), and refuses the same day", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const d = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    const cols = (await api(`/api/boards/${d.id}`, { as: owner })).json.board.columns;
    const a = await createCard(owner, cols[0].id, "A");
    const b = await createCard(owner, cols[0].id, "B");
    const c = await createCard(owner, cols[0].id, "C");

    const one = await api(`/api/cards/${a.id}/transfer`, { as: owner, body: { date: "2026-11-27" } });
    expect(one.status).toBe(200);
    expect(one.json.card.boardId).toBe(one.json.board.id);
    expect((await api(`/api/cards/${a.id}/transfer`, { as: owner, body: { date: "2026-11-27" } })).status).toBe(400);
    expect((await api(`/api/cards/${b.id}/transfer`, { as: outsider, body: { date: "2026-11-27" } })).status).toBe(403);
    expect((await api(`/api/cards/${b.id}/transfer`, { as: owner, body: { date: "nope" } })).status).toBe(400);

    const some = await api(`/api/boards/${d.id}/transfer`, { as: owner, body: { date: "2026-11-27", cardIds: [c.id, "unknown"] } });
    expect(some.json.moved).toEqual([c.id]);
    expect(await prisma.card.count({ where: { boardId: d.id } })).toBe(1);

    // From the main board too: the task gets a day.
    const main = (await api(`/api/boards/${board.id}`, { as: owner })).json.board;
    const m = await createCard(owner, main.columns[0].id, "Sans date");
    const r = await api(`/api/cards/${m.id}/transfer`, { as: owner, body: { date: "2026-11-27" } });
    expect(r.json.board.id).toBe(one.json.board.id);
    const h = (await api(`/api/boards/${board.id}/history?cardId=${m.id}`, { as: owner })).json.items;
    expect(h[0]).toMatchObject({ kind: "CARD_MOVED", from: null, to: "2026-11-27" });
  });

  it("records Kanban moves and due date changes in the history", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL", "Elisa30");
    const d = (await open(owner, board.id, "DAY", "2026-11-24")).json.board;
    await api(`/api/boards/${d.id}/reschedule`, { as: owner, body: { date: "2026-11-26" } });
    const cols = (await api(`/api/boards/${d.id}`, { as: owner })).json.board.columns;
    const card = await createCard(owner, cols[0].id, "Commande");
    await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { dueDate: "2026-11-28" } });
    await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { dueDate: "2026-11-28" } }); // unchanged
    await api(`/api/cards/${card.id}`, { as: owner, method: "PATCH", body: { dueDate: null } });

    const items = (await api(`/api/boards/${board.id}/history`, { as: owner })).json.items;
    expect(items.map((i: any) => [i.kind, i.from, i.to])).toEqual([
      ["DUE_DATE", "2026-11-28", null],
      ["DUE_DATE", null, "2026-11-28"],
      ["BOARD_MOVED", "2026-11-24", "2026-11-26"],
    ]);
    // History is reserved to members.
    const outsider = await createUser();
    expect((await api(`/api/boards/${board.id}/history`, { as: outsider })).status).toBe(403);
  });
});
