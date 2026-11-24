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
});
