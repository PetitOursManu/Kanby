import { describe, it, expect, afterAll } from "vitest";
import { api, createUser, createBoard, createCard, uniqueEmail, fakeIp, prisma, BASE } from "./helpers";

afterAll(() => prisma.$disconnect());

describe("admin API", () => {
  it("is forbidden to regular users and anonymous visitors", async () => {
    const u = await createUser();
    for (const p of ["/api/admin/users", "/api/admin/boards", "/api/admin/stats"]) {
      expect((await api(p, { as: u })).status, p).toBe(403);
      expect((await api(p)).status, p).toBe(401);
    }
  });

  it("lists users, boards and stats", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const u = await createUser();
    await createBoard(u);
    expect((await api("/api/admin/users", { as: admin })).json.users.some((x: any) => x.id === u.id)).toBe(true);
    expect((await api("/api/admin/boards", { as: admin })).json.boards.length).toBeGreaterThan(0);
    const s = (await api("/api/admin/stats", { as: admin })).json;
    expect(s).toHaveProperty("users");
    expect(s).toHaveProperty("completedTasks");
  });

  it("creates users with the same password policy as registration", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const email = uniqueEmail("created");
    expect((await api("/api/admin/users", { as: admin, body: { email, displayName: "C", password: "1234567" } })).status).toBe(400);
    const r = await api("/api/admin/users", { as: admin, body: { email, displayName: "C", password: "12345678" } });
    expect(r.status).toBe(201);
    expect((await api("/api/admin/users", { as: admin, body: { email, displayName: "C", password: "12345678" } })).status).toBe(409);
    expect((await api("/api/admin/users", { as: admin, body: { email: "bad", displayName: "C", password: "12345678" } })).status).toBe(400);
    const db = await prisma.user.findUnique({ where: { email } });
    expect(db?.mustChangePwd).toBe(true);
  });

  it("deactivates/reactivates users, never itself; unknown ids give 404", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const u = await createUser();
    expect((await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: u.id, active: false } })).status).toBe(200);
    const login = await api("/api/auth/login", { headers: { "x-forwarded-for": fakeIp() }, body: { email: u.email, password: u.password } });
    expect(login.status).toBe(401);
    expect((await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: admin.id, active: false } })).status).toBe(400);
    expect((await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: "nope", active: false } })).status).toBe(404);
  });

  it("changes roles and resets passwords; cannot demote itself", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const u = await createUser();
    expect((await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: u.id, globalRole: "ADMIN" } })).status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.globalRole).toBe("ADMIN");
    expect((await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: admin.id, globalRole: "USER" } })).status).toBe(400);
    const reset = await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: u.id, password: "temporary-1" } });
    expect(reset.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.mustChangePwd).toBe(true);
    const login = await api("/api/auth/login", { headers: { "x-forwarded-for": fakeIp() }, body: { email: u.email, password: "temporary-1" } });
    expect(login.status).toBe(200);
  });

  it("a demoted admin loses admin access immediately", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const other = await createUser({ role: "ADMIN" });
    await api("/api/admin/users", { as: admin, method: "PATCH", body: { userId: other.id, globalRole: "USER" } });
    expect((await api("/api/admin/users", { as: other })).status).toBe(403);
    const page = await fetch(BASE + "/admin", { headers: { cookie: other.cookie }, redirect: "manual" });
    expect(page.status).not.toBe(200);
  });

  it("deletes users (and their boards), never itself; unknown ids give 404", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    await createCard(u, columns[0].id);
    expect((await api(`/api/admin/users/${admin.id}`, { as: admin, method: "DELETE" })).status).toBe(400);
    expect((await api(`/api/admin/users/nope`, { as: admin, method: "DELETE" })).status).toBe(404);
    expect((await api(`/api/admin/users/${u.id}`, { as: admin, method: "DELETE" })).status).toBe(200);
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull();
  });
});

describe("widget", () => {
  it("requires a token and summarizes due cards", async () => {
    const u = await createUser();
    const { columns } = await createBoard(u);
    const card = await createCard(u, columns[0].id, "Due");
    const yesterday = new Date(Date.now() - 2 * 86400000).toISOString();
    await api(`/api/cards/${card.id}`, { as: u, method: "PATCH", body: { dueDate: yesterday } });
    expect((await api("/api/widget/summary")).status).toBe(401);
    const tok = (await api("/api/me/tokens", { as: u, body: { label: "Dashy" } })).json.raw;
    const r = await api(`/api/widget/summary?token=${tok}`);
    expect(r.status).toBe(200);
    expect(r.json.counts.overdue).toBe(1);
    const view = await fetch(`${BASE}/widget/view?token=${tok}`);
    expect(view.status).toBe(200);
    expect(await view.text()).toContain("Due");
  });
});

describe("instance settings: public sign-up", () => {
  it("only admins read or change it; closing it blocks registration", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const user = await createUser();
    expect((await api("/api/admin/settings", { as: user })).status).toBe(403);
    expect((await api("/api/admin/settings", { as: user, method: "PATCH", body: { allowRegistration: false } })).status).toBe(403);
    expect((await api("/api/admin/settings", { as: admin, method: "PATCH", body: { allowRegistration: "no" } })).status).toBe(400);
    try {
      const off = await api("/api/admin/settings", { as: admin, method: "PATCH", body: { allowRegistration: false } });
      expect(off.json.settings.allowRegistration).toBe(false);
      const reg = await api("/api/auth/register", {
        headers: { "x-forwarded-for": fakeIp() },
        body: { email: uniqueEmail("closed"), password: "abcdefgh", displayName: "Closed" },
      });
      expect(reg.status).toBe(403);
      const page = await (await fetch(BASE + "/login")).text();
      expect(page).not.toContain('href="/register"');
      // Admins can still create accounts.
      expect((await api("/api/admin/users", { as: admin, body: { email: uniqueEmail("byadmin"), displayName: "X", password: "12345678" } })).status).toBe(201);
    } finally {
      await api("/api/admin/settings", { as: admin, method: "PATCH", body: { allowRegistration: true } });
    }
    const reg = await api("/api/auth/register", {
      headers: { "x-forwarded-for": fakeIp() },
      body: { email: uniqueEmail("open"), password: "abcdefgh", displayName: "Open" },
    });
    expect(reg.status).toBe(200);
  });
});
