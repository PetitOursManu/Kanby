import { describe, it, expect, afterAll } from "vitest";
import { api, createUser, createBoard, addMember, createCard, prisma } from "./helpers";

afterAll(() => prisma.$disconnect());

describe("boards", () => {
  it("creates a board with three default columns (Todo / Doing / Done)", async () => {
    const u = await createUser();
    const { columns } = await createBoard(u);
    expect(columns.map((c: any) => c.kind)).toEqual(["TODO", "DOING", "DONE"]);
  });

  it("validates the name", async () => {
    const u = await createUser();
    expect((await api("/api/boards", { as: u, body: { name: "  " } })).status).toBe(400);
    expect((await api("/api/boards", { as: u, body: { name: "x".repeat(300) } })).status).toBe(400);
  });

  it("lists owned and shared boards", async () => {
    const owner = await createUser();
    const member = await createUser();
    const { board } = await createBoard(owner, "TEAM", "Shared");
    await addMember(owner, board.id, member);
    const r = await api("/api/boards", { as: member });
    expect(r.json.member.map((b: any) => b.id)).toContain(board.id);
    const o = await api("/api/boards", { as: owner });
    expect(o.json.owned.map((b: any) => b.id)).toContain(board.id);
    // A team board must not appear twice for its owner.
    expect(o.json.member.map((b: any) => b.id)).not.toContain(board.id);
  });

  it("hides boards from outsiders (403) and returns 404 for unknown ids", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const { board } = await createBoard(owner);
    expect((await api(`/api/boards/${board.id}`, { as: outsider })).status).toBe(403);
    expect((await api(`/api/boards/does-not-exist`, { as: owner })).status).toBe(404);
    expect((await api(`/api/boards/${board.id}`)).status).toBe(401);
  });

  it("only the owner can rename or delete; empty names are rejected", async () => {
    const owner = await createUser();
    const member = await createUser();
    const { board } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, member);
    expect((await api(`/api/boards/${board.id}`, { as: member, method: "PATCH", body: { name: "Hack" } })).status).toBe(403);
    expect((await api(`/api/boards/${board.id}`, { as: owner, method: "PATCH", body: { name: "" } })).status).toBe(400);
    const ok = await api(`/api/boards/${board.id}`, { as: owner, method: "PATCH", body: { name: "Renamed" } });
    expect(ok.json.board.name).toBe("Renamed");
    expect((await api(`/api/boards/${board.id}`, { as: member, method: "DELETE" })).status).toBe(403);
    expect((await api(`/api/boards/${board.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull();
  });

  it("turning a team board back into a personal one removes the other members", async () => {
    const owner = await createUser();
    const member = await createUser();
    const { board } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, member);
    const r = await api(`/api/boards/${board.id}`, { as: owner, method: "PATCH", body: { type: "PERSONAL" } });
    expect(r.status).toBe(200);
    expect((await api(`/api/boards/${board.id}`, { as: member })).status).toBe(403);
  });

  it("promoting a personal board to team makes the owner a member", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "PERSONAL");
    await api(`/api/boards/${board.id}`, { as: owner, method: "PATCH", body: { type: "TEAM" } });
    const m = await prisma.boardMember.findMany({ where: { boardId: board.id } });
    expect(m.map((x) => x.userId)).toEqual([owner.id]);
  });
});

describe("board members", () => {
  it("owner invites by email or id; outsiders and members cannot invite", async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();
    const { board } = await createBoard(owner, "TEAM");
    const r = await api(`/api/boards/${board.id}/members`, { as: owner, body: { email: a.email.toUpperCase() } });
    expect(r.status).toBe(201);
    expect((await api(`/api/boards/${board.id}/members`, { as: a, body: { userId: b.id } })).status).toBe(403);
    const list = await api(`/api/boards/${board.id}/members`, { as: a });
    expect(list.json.members.map((m: any) => m.user.id).sort()).toEqual([owner.id, a.id].sort());
  });

  it("returns 404 for unknown users instead of crashing", async () => {
    const owner = await createUser();
    const { board } = await createBoard(owner, "TEAM");
    expect((await api(`/api/boards/${board.id}/members`, { as: owner, body: { email: "nobody@nowhere.test" } })).status).toBe(404);
    expect((await api(`/api/boards/${board.id}/members`, { as: owner, body: { userId: "nope" } })).status).toBe(404);
    expect((await api(`/api/boards/${board.id}/members`, { as: owner, body: {} })).status).toBe(400);
  });

  it("refuses to share a personal board", async () => {
    const owner = await createUser();
    const a = await createUser();
    const { board } = await createBoard(owner, "PERSONAL");
    expect((await api(`/api/boards/${board.id}/members`, { as: owner, body: { userId: a.id } })).status).toBe(400);
  });

  it("owner removes a member; a member can leave; the owner cannot be removed", async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();
    const { board } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, a);
    await addMember(owner, board.id, b);
    expect((await api(`/api/boards/${board.id}/members?userId=${a.id}`, { as: owner, method: "DELETE" })).status).toBe(200);
    expect((await api(`/api/boards/${board.id}/members?userId=${owner.id}`, { as: owner, method: "DELETE" })).status).toBe(400);
    expect((await api(`/api/boards/${board.id}/members?userId=${owner.id}`, { as: b, method: "DELETE" })).status).toBe(403);
    // Leaving the board.
    expect((await api(`/api/boards/${board.id}/members?userId=${b.id}`, { as: b, method: "DELETE" })).status).toBe(200);
    expect((await api(`/api/boards/${board.id}`, { as: b })).status).toBe(403);
  });

  it("removing a member unassigns them from the board's cards", async () => {
    const owner = await createUser();
    const a = await createUser();
    const { board, columns } = await createBoard(owner, "TEAM");
    await addMember(owner, board.id, a);
    const card = await createCard(owner, columns[0].id);
    await api(`/api/cards/${card.id}/assign`, { as: owner, body: { userId: a.id } });
    await api(`/api/boards/${board.id}/members?userId=${a.id}`, { as: owner, method: "DELETE" });
    const db = await prisma.card.findUnique({ where: { id: card.id } });
    expect(db?.assigneeId).toBeNull();
  });
});

describe("admin access to boards", () => {
  it("admins can read any board but cannot edit its content", async () => {
    const owner = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const { board, columns } = await createBoard(owner);
    expect((await api(`/api/boards/${board.id}`, { as: admin })).status).toBe(200);
    expect((await api("/api/cards", { as: admin, body: { columnId: columns[0].id, title: "x" } })).status).toBe(403);
    expect((await api("/api/columns", { as: admin, body: { boardId: board.id, name: "x" } })).status).toBe(403);
  });
});
