import { describe, it, expect, afterAll } from "vitest";
import { api, createUser, uniqueEmail, fakeIp, prisma, BASE } from "./helpers";

afterAll(() => prisma.$disconnect());

describe("health", () => {
  it("reports ok and checks the database", async () => {
    const r = await api("/api/health");
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("ok");
    expect(r.json.database).toBe("ok");
  });
});

describe("register", () => {
  const ip = fakeIp();
  const h = { "x-forwarded-for": ip };

  it("creates an account, sets a session cookie and never makes it admin", async () => {
    const email = uniqueEmail("reg");
    const r = await api("/api/auth/register", { headers: h, body: { email, password: "abcdefgh", displayName: "Reg" } });
    expect(r.status).toBe(200);
    expect(r.json.user.globalRole).toBe("USER");
    expect(r.headers.get("set-cookie")).toContain("kanby_session=");
  });

  it("rejects duplicates (case-insensitive)", async () => {
    const email = uniqueEmail("dup");
    await api("/api/auth/register", { headers: h, body: { email, password: "abcdefgh", displayName: "A" } });
    const r = await api("/api/auth/register", { headers: h, body: { email: email.toUpperCase(), password: "abcdefgh", displayName: "B" } });
    expect(r.status).toBe(409);
  });

  it("validates email, password and name", async () => {
    const h2 = { "x-forwarded-for": fakeIp() };
    expect((await api("/api/auth/register", { headers: h2, body: { email: "nope", password: "abcdefgh", displayName: "A" } })).status).toBe(400);
    expect((await api("/api/auth/register", { headers: h2, body: { email: uniqueEmail(), password: "short", displayName: "A" } })).status).toBe(400);
    expect((await api("/api/auth/register", { headers: h2, body: { email: uniqueEmail(), password: "abcdefgh", displayName: "   " } })).status).toBe(400);
    const h3 = { "x-forwarded-for": fakeIp() };
    expect((await api("/api/auth/register", { headers: h3, body: { email: uniqueEmail(), password: "abcdefgh", displayName: "x".repeat(200) } })).status).toBe(400);
    expect((await api("/api/auth/register", { headers: h3, raw: "{not json" })).status).toBe(400);
  });
});

describe("login / logout", () => {
  it("logs in with a case-insensitive email", async () => {
    const u = await createUser();
    const r = await api("/api/auth/login", { headers: { "x-forwarded-for": fakeIp() }, body: { email: u.email.toUpperCase(), password: u.password } });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("kanby_session=");
  });

  it("rejects a wrong password and an inactive account with the same message", async () => {
    const h = { "x-forwarded-for": fakeIp() };
    const u = await createUser();
    const bad = await api("/api/auth/login", { headers: h, body: { email: u.email, password: "wrong-password" } });
    expect(bad.status).toBe(401);
    const off = await createUser({ active: false });
    const r = await api("/api/auth/login", { headers: h, body: { email: off.email, password: off.password } });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe(bad.json.error);
  });

  it("rate-limits brute force", async () => {
    const h = { "x-forwarded-for": fakeIp() };
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await api("/api/auth/login", { headers: h, body: { email: "x@y.z", password: "nope-nope" } })).status;
    }
    expect(last).toBe(429);
  });

  it("logout clears the cookie", async () => {
    const r = await api("/api/auth/logout", { method: "POST" });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/kanby_session=;|Max-Age=0/);
  });

  it("a deactivated user's existing session stops working", async () => {
    const u = await createUser();
    expect((await api("/api/me/profile", { as: u })).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect((await api("/api/me/profile", { as: u })).status).toBe(401);
  });

  it("a forged/garbage session cookie is rejected", async () => {
    const r = await fetch(BASE + "/api/me/profile", { headers: { cookie: "kanby_session=abc.def.ghi" } });
    expect(r.status).toBe(401);
  });
});

describe("API tokens (mobile)", () => {
  it("exchanges credentials for a token usable as Bearer, then revokes it", async () => {
    const u = await createUser();
    const r = await api("/api/auth/token", { headers: { "x-forwarded-for": fakeIp() }, body: { email: u.email, password: u.password, label: "phone" } });
    expect(r.status).toBe(200);
    expect(r.json.token).toMatch(/^kbt_[0-9a-f]{64}$/);
    const auth = { authorization: `Bearer ${r.json.token}` };
    expect((await api("/api/me/profile", { headers: auth })).status).toBe(200);
    expect((await api("/api/auth/revoke", { method: "POST", headers: auth })).status).toBe(200);
    expect((await api("/api/me/profile", { headers: auth })).status).toBe(401);
  });

  it("an invalid Bearer never falls back to the cookie", async () => {
    const u = await createUser();
    const r = await api("/api/me/profile", { as: u, headers: { authorization: "Bearer kbt_invalid" } });
    expect(r.status).toBe(401);
  });

  it("tokens can be listed and revoked from the profile, only by their owner", async () => {
    const u = await createUser();
    const other = await createUser();
    const created = await api("/api/me/tokens", { as: u, body: { label: "Dashy" } });
    expect(created.status).toBe(201);
    expect(created.json.raw).toMatch(/^kbt_/);
    const list = await api("/api/me/tokens", { as: u });
    expect(list.json.tokens.map((t: any) => t.label)).toContain("Dashy");
    expect(JSON.stringify(list.json)).not.toContain(created.json.raw);
    expect((await api(`/api/me/tokens/${created.json.token.id}`, { as: other, method: "DELETE" })).status).toBe(404);
    expect((await api(`/api/me/tokens/${created.json.token.id}`, { as: u, method: "DELETE" })).status).toBe(200);
    expect((await api("/api/me/tokens", { as: u })).json.tokens).toHaveLength(0);
  });
});

describe("password & profile", () => {
  it("changing the password requires the current one and clears mustChangePwd", async () => {
    const u = await createUser({ mustChangePwd: true });
    expect((await api("/api/me/password", { as: u, body: { currentPassword: "wrong", newPassword: "new-password-1" } })).status).toBe(400);
    expect((await api("/api/me/password", { as: u, body: { currentPassword: u.password, newPassword: "short" } })).status).toBe(400);
    expect((await api("/api/me/password", { as: u, body: { currentPassword: u.password, newPassword: "new-password-1" } })).status).toBe(200);
    const db = await prisma.user.findUnique({ where: { id: u.id } });
    expect(db?.mustChangePwd).toBe(false);
  });

  it("updates the display name and validates the avatar URL", async () => {
    const u = await createUser();
    const ok = await api("/api/me/profile", { as: u, method: "PATCH", body: { displayName: "  Nouveau  ", avatarUrl: "https://example.com/a.png" } });
    expect(ok.status).toBe(200);
    expect(ok.json.displayName).toBe("Nouveau");
    expect((await api("/api/me/profile", { as: u, method: "PATCH", body: { avatarUrl: "javascript:alert(1)" } })).status).toBe(400);
    expect((await api("/api/me/profile", { as: u, method: "PATCH", body: { displayName: "x".repeat(300) } })).status).toBe(400);
    expect((await api("/api/me/profile", { as: u, method: "PATCH", body: { avatarUrl: null } })).status).toBe(200);
  });

  it("sets the language cookie and rejects unknown locales", async () => {
    const u = await createUser();
    const r = await api("/api/me/language", { as: u, body: { locale: "en" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("kanby_locale=en");
    expect((await api("/api/me/language", { as: u, body: { locale: "de" } })).status).toBe(400);
  });
});

describe("protected pages", () => {
  it("redirects anonymous visitors to /login", async () => {
    const r = await fetch(BASE + "/boards", { redirect: "manual" });
    expect([307, 308]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/login");
  });

  it("forces a password change before using the app", async () => {
    const u = await createUser({ mustChangePwd: true });
    const r = await fetch(BASE + "/boards", { headers: { cookie: u.cookie }, redirect: "manual" });
    expect([303, 307, 308]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/profile");
  });

  it("keeps /admin for admins", async () => {
    const u = await createUser();
    const r = await fetch(BASE + "/admin", { headers: { cookie: u.cookie }, redirect: "manual" });
    expect([307, 308]).toContain(r.status);
    expect(r.headers.get("location")).toContain("/boards");
  });

  it("serves public pages", async () => {
    for (const p of ["/login", "/register", "/help"]) {
      const r = await fetch(BASE + p);
      expect(r.status, p).toBe(200);
    }
  });
});
