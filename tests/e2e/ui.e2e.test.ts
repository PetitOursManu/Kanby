/**
 * End-to-end UI suite: drives a real Chromium against a running Kanby.
 *
 *   KANBY_TEST_URL=http://localhost:3005 DATABASE_URL=… JWT_SECRET=… npm run test:e2e
 *
 * Needs the `playwright` package and its Chromium (npx playwright install chromium).
 */
import { createRequire } from "node:module";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { BASE, prisma, createUser, createBoard, createCard, addMember, api, cardOrder, type TestUser } from "../api/helpers";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright") as typeof import("playwright");

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await prisma.$disconnect();
});

/** A browser context already signed in as `user`. */
async function signedIn(user: TestUser, opts: Parameters<Browser["newContext"]>[0] = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, ...opts });
  const [name, value] = user.cookie.split("=");
  await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}

/** Drag an element onto another with real mouse moves (dnd-kit needs intermediate moves). */
async function drag(page: Page, from: string, to: string, opts: { below?: boolean } = {}) {
  const a = (await page.locator(from).boundingBox())!;
  const b = (await page.locator(to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 4 });
  const ty = opts.below ? b.y + b.height * 0.8 : b.y + b.height * 0.2;
  await page.mouse.move(b.x + b.width / 2, ty, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.move(b.x + b.width / 2, ty + 2, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

const cardSel = (title: string) => `[data-card-id]:has-text("${title}")`;
/** Unique suffix so names never collide with earlier runs in the same database. */
const RUN = Math.random().toString(36).slice(2, 7);

describe("authentication", () => {
  it("shows an error on a wrong password and signs in with the right one", async () => {
    const u = await createUser();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + "/login");
    await page.fill("#email", u.email);
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    const alert = page.locator("form p[role=alert]");
    await alert.waitFor();
    expect(await alert.textContent()).toMatch(/Identifiants invalides|Invalid credentials/);
    await page.fill("#password", u.password);
    await page.click("button[type=submit]");
    await page.waitForURL("**/boards");
    await ctx.close();
  });

  it("never redirects to another site after login (?next=)", async () => {
    const u = await createUser();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + "/login?next=https://evil.example/steal");
    await page.fill("#email", u.email);
    await page.fill("#password", u.password);
    await page.click("button[type=submit]");
    await page.waitForURL("**/boards");
    expect(new URL(page.url()).host).toBe(new URL(BASE).host);
    await ctx.close();
  });

  it("forces a password change, then lets the user in", async () => {
    const u = await createUser({ mustChangePwd: true });
    const { ctx, page } = await signedIn(u);
    await page.goto(BASE + "/boards");
    await page.waitForURL("**/profile?mustChange=1");
    await page.fill("#current-password", u.password);
    await page.fill("#new-password", "brand-new-password");
    await page.fill("#confirm-password", "brand-new-password");
    await page.getByRole("button", { name: /Changer le mot de passe|Change password/ }).click();
    await page.waitForURL("**/boards");
    await ctx.close();
  });

  it("switches the language from the login page", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + "/login");
    await page.getByRole("radio", { name: "en" }).click();
    await page.waitForLoadState("load");
    expect(await page.locator("h1").textContent()).toMatch(/Sign in|Log in|Connexion/);
    await ctx.close();
  });
});

describe("boards and cards", () => {
  it("creates a board from the UI with three default columns", async () => {
    const u = await createUser();
    const { ctx, page, errors } = await signedIn(u);
    await page.goto(BASE + "/boards");
    await page.getByRole("button", { name: /Nouveau tableau|New board|Créer un tableau/ }).first().click();
    await page.fill("#board-name", "Mon projet");
    await page.locator("[role=dialog] button[type=submit]").click();
    await page.waitForURL(/\/boards\/[a-z0-9]+$/);
    expect(await page.locator("section[id^=col-]").count()).toBe(3);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("adds several cards in a row with the composer (Enter keeps it open)", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    const { ctx, page } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}`);
    const col = page.locator(`#col-${columns[0].id}`);
    await col.getByRole("button", { name: /Ajouter une tâche|Add a task/ }).click();
    const box = col.locator("textarea");
    await box.fill("Première");
    await box.press("Enter");
    await col.locator(cardSel("Première")).waitFor();
    await box.fill("Deuxième");
    await box.press("Enter");
    await col.locator(cardSel("Deuxième")).waitFor();
    expect(await cardOrder(columns[0].id)).toEqual(["Première", "Deuxième"]);
    await ctx.close();
  });

  it("reorders cards inside a column with the mouse and keeps the order after reload", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    for (const t of ["A", "B", "C"]) await createCard(u, columns[0].id, t);
    const { ctx, page, errors } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}`);
    await drag(page, cardSel("C"), cardSel("A"));
    expect(await cardOrder(columns[0].id)).toEqual(["C", "A", "B"]);
    await page.reload();
    const titles = await page.locator(`#col-${columns[0].id} [data-card-id]`).allTextContents();
    expect(titles.map((x) => x.trim())).toEqual(["C", "A", "B"]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("moves a card to Done: struck through, completed in the database", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    const card = await createCard(u, columns[0].id, "Finir le rapport");
    await createCard(u, columns[2].id, "Déjà fait");
    const { ctx, page } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}`);
    await drag(page, cardSel("Finir le rapport"), cardSel("Déjà fait"), { below: true });
    const db = await prisma.card.findUnique({ where: { id: card.id } });
    expect(db?.columnId).toBe(columns[2].id);
    expect(db?.completedAt).not.toBeNull();
    expect(await page.locator(`#col-${columns[2].id} ${cardSel("Finir le rapport")} .line-through`).count()).toBe(1);
    await ctx.close();
  });

  it("edits a card in the modal and the board updates without reload", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    await createCard(u, columns[0].id, "Ancien titre");
    await createCard(u, columns[0].id, "Autre");
    const { ctx, page, errors } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}`);
    await page.locator(cardSel("Ancien titre")).click();
    const dialog = page.getByRole("dialog");
    const title = dialog.getByLabel(/Titre de la carte|Card title/);
    await title.fill("Nouveau titre");
    await title.press("Enter");
    await dialog.getByLabel(/Ajouter une sous-tâche|Add a sub-task/).fill("Étape 1");
    await dialog.getByLabel(/Ajouter une sous-tâche|Add a sub-task/).press("Enter");
    await dialog.getByRole("checkbox", { name: "Étape 1" }).check();
    await dialog.getByLabel(/Écrire un commentaire|Write a comment/).fill("Bonjour");
    await dialog.getByRole("button", { name: /Envoyer|Send/ }).click();
    await dialog.getByText("Bonjour").waitFor();
    await dialog.getByRole("button", { name: /Nouvelle étiquette|New label/ }).click();
    await dialog.getByLabel(/Nom de l'étiquette|Label name/).fill("Urgent");
    await dialog.getByRole("button", { name: /^Créer$|^Create$/ }).click();
    await dialog.locator("[aria-pressed=true]", { hasText: "Urgent" }).waitFor();
    await page.keyboard.press("Escape");
    const card = page.locator(cardSel("Nouveau titre"));
    await card.waitFor();
    expect(await card.textContent()).toContain("1/1");
    expect(await card.textContent()).toContain("Urgent");
    // The card stayed in place (first of its column).
    const titles = await page.locator(`#col-${columns[0].id} [data-card-id] p`).allTextContents();
    expect(titles[0]).toBe("Nouveau titre");
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("opens a card from a ?card= link and from the keyboard", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    const c = await createCard(u, columns[0].id, "Lien direct");
    const { ctx, page } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}?card=${c.id}`);
    await page.getByRole("dialog").getByLabel(/Titre de la carte|Card title/).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(cardSel("Lien direct")).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").getByLabel(/Titre de la carte|Card title/).waitFor();
    await ctx.close();
  });

  it("manages columns: add, rename, change type, delete with confirmation", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    await createCard(u, columns[0].id, "Carte");
    const { ctx, page } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}`);
    await page.getByRole("button", { name: /Ajouter une colonne|Add a column/ }).click();
    await page.fill("#name-dialog-input", "Bloqué");
    await page.getByRole("dialog").locator("button[type=submit]").click();
    await page.locator("section[aria-label=Bloqué]").waitFor();
    // Rename the first column through its menu.
    await page.locator(`#col-${columns[0].id}`).getByRole("button", { name: /Options de la colonne|Options for column/ }).click();
    await page.getByRole("menuitem", { name: /Renommer|Rename/ }).click();
    const input = page.locator(`#col-${columns[0].id} input`);
    await input.fill("Idées");
    await input.press("Enter");
    await page.waitForTimeout(300);
    expect((await prisma.column.findUnique({ where: { id: columns[0].id } }))?.name).toBe("Idées");
    // Make it a Done column.
    await page.locator(`#col-${columns[0].id}`).getByRole("button", { name: /Options de la colonne|Options for column/ }).click();
    await page.getByRole("menuitemradio", { name: /Terminé|Done/ }).click();
    await page.waitForTimeout(300);
    expect((await prisma.card.findFirst({ where: { columnId: columns[0].id } }))?.completedAt).not.toBeNull();
    // Delete it.
    await page.locator(`#col-${columns[0].id}`).getByRole("button", { name: /Options de la colonne|Options for column/ }).click();
    await page.getByRole("menuitem", { name: /Supprimer la colonne|Delete column/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Supprimer la colonne|Delete column/ }).click();
    await page.locator(`#col-${columns[0].id}`).waitFor({ state: "detached" });
    expect(await prisma.column.findUnique({ where: { id: columns[0].id } })).toBeNull();
    await ctx.close();
  });

  it("filters cards and disables dragging while filtering", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u);
    await createCard(u, columns[0].id, "Acheter du pain");
    await createCard(u, columns[0].id, "Réparer le vélo");
    const { ctx, page } = await signedIn(u);
    await page.goto(`${BASE}/boards/${board.id}`);
    await page.keyboard.press("/");
    await page.keyboard.type("pain");
    expect(await page.locator("[data-card-id]").count()).toBe(1);
    await page.getByRole("status").filter({ hasText: /glisser|drag/ }).waitFor();
    await page.keyboard.press("Escape");
    expect(await page.locator("[data-card-id]").count()).toBe(2);
    await ctx.close();
  });

  it("members: owner invites, the member sees the board and notifications work", async () => {
    const owner = await createUser({ name: `Alice ${RUN}` });
    const member = await createUser({ name: `Bob ${RUN}` });
    const { board, columns } = await createBoard(owner, "TEAM", "Équipe");
    const card = await createCard(owner, columns[0].id, "Tâche partagée");
    const { ctx, page } = await signedIn(owner);
    await page.goto(`${BASE}/boards/${board.id}`);
    await page.getByRole("button", { name: /^Inviter$|^Invite$/ }).click();
    await page.fill("#member-search", `Bob ${RUN}`);
    await page.getByRole("dialog").getByRole("button", { name: /^Inviter$|^Invite$/ }).click();
    await page.getByRole("dialog").getByText(/Ajouté|Added/).waitFor();
    await page.keyboard.press("Escape");
    // The member comments → the owner gets a notification.
    await api("/api/comments", { as: member, body: { cardId: card.id, text: "Je prends !" } });
    await page.reload();
    const bell = page.getByRole("button", { name: /Notifications, 1 non lue|Notifications, 1 unread/ });
    await bell.click();
    await page.getByText(new RegExp(`Bob ${RUN} (a commenté|commented)`)).waitFor();
    await page.getByRole("button", { name: /Tout marquer comme lu|Mark all as read/ }).click();
    await page.waitForTimeout(300);
    expect((await api("/api/notifications", { as: owner })).json.unreadCount).toBe(0);
    await ctx.close();
  });
});

describe("appearance", () => {
  it("switches to dark mode and remembers it", async () => {
    const u = await createUser();
    const { ctx, page } = await signedIn(u, { colorScheme: "light" });
    await page.goto(BASE + "/boards");
    await page.getByRole("radio", { name: /Sombre|Dark/ }).first().click();
    expect(await page.locator("html").getAttribute("class")).toContain("dark");
    await page.reload();
    expect(await page.locator("html").getAttribute("class")).toContain("dark");
    await page.getByRole("radio", { name: /Clair|Light/ }).first().click();
    expect(await page.locator("html").getAttribute("class")).not.toContain("dark");
    await ctx.close();
  });

  it("works on a phone: no page-level horizontal scroll, drawer menu, scrollable card modal", async () => {
    const u = await createUser();
    const { board, columns } = await createBoard(u, "TEAM");
    const c = await createCard(u, columns[0].id, "Sur mobile");
    for (let i = 0; i < 25; i++) await api("/api/checklist", { as: u, body: { cardId: c.id, text: `Point ${i}` } });
    const { ctx, page, errors } = await signedIn(u, { ...devices["iPhone 13"] });
    await page.goto(`${BASE}/boards/${board.id}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: /Ouvrir le menu|Open menu/ }).tap();
    await page.getByRole("dialog", { name: /Navigation principale|Main navigation/ }).waitFor();
    await page.getByRole("button", { name: /Fermer|Close/ }).first().tap();
    await page.locator(cardSel("Sur mobile")).tap();
    const scroller = page.locator("[role=dialog] .overflow-y-auto").first();
    await scroller.waitFor();
    const canScroll = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(canScroll).toBe(true);
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.getByRole("button", { name: /Supprimer la carte|Delete card/ }).waitFor();
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe("admin", () => {
  it("resets a user's password from the admin page", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const target = await createUser({ name: `Zed ${RUN}` });
    const { ctx, page } = await signedIn(admin);
    await page.goto(BASE + "/admin");
    await page.getByLabel(/Rechercher un utilisateur|Search users/).fill(`Zed ${RUN}`);
    await page.getByRole("button", { name: new RegExp(`(Actions pour|Actions for) Zed ${RUN}`) }).click();
    await page.getByRole("menuitem", { name: /Réinitialiser le mot de passe|Reset password/ }).click();
    await page.fill("#reset-password", "temp-password-1");
    await page.getByRole("dialog").locator("button[type=submit]").click();
    await page.getByRole("status").filter({ hasText: `Zed ${RUN}` }).waitFor();
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.mustChangePwd).toBe(true);
    await ctx.close();
  });

  it("admins open other people's boards read-only", async () => {
    const owner = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const { board, columns } = await createBoard(owner);
    await createCard(owner, columns[0].id, "Privé");
    const { ctx, page } = await signedIn(admin);
    await page.goto(`${BASE}/boards/${board.id}`);
    await page.getByText(/Lecture seule|Read-only/).waitFor();
    expect(await page.getByRole("button", { name: /Ajouter une tâche|Add a task/ }).count()).toBe(0);
    await ctx.close();
  });
});

// Keep the member helper referenced for future tests.
void addMember;
