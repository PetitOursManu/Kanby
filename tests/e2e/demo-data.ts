/**
 * Creates demo users and a realistic team board through the API.
 * Used by the e2e suite and to take screenshots.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const BASE = process.env.KANBY_TEST_URL || "http://localhost:3005";
const prisma = new PrismaClient();

export type Demo = {
  owner: { email: string; password: string; id: string };
  member: { email: string; password: string; id: string };
  boardId: string;
};

async function user(email: string, displayName: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });
  return prisma.user.create({
    data: { email, displayName, passwordHash: await bcrypt.hash(password, 4), globalRole: "ADMIN" },
  });
}

async function call(cookie: string, path: string, body?: unknown, method?: string) {
  const res = await fetch(BASE + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { cookie, "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function login(email: string, password: string) {
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.1` },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("login failed " + res.status);
  return res.headers.get("set-cookie")!.split(";")[0];
}

export async function createDemo(tag = Math.random().toString(36).slice(2, 7)): Promise<Demo> {
  const password = "demo-password";
  const o = await user(`manu-${tag}@demo.kanby`, "Manu Lefèvre", password);
  const m = await user(`claire-${tag}@demo.kanby`, "Claire Bernard", password);
  await prisma.user.update({ where: { id: m.id }, data: { globalRole: "USER" } });
  const t = await user(`thomas-${tag}@demo.kanby`, "Thomas Roux", password);
  await prisma.user.update({ where: { id: t.id }, data: { globalRole: "USER" } });
  const cookie = await login(o.email, password);

  const { board } = await call(cookie, "/api/boards", { name: "Refonte site web", type: "TEAM" });
  await call(cookie, `/api/boards/${board.id}/members`, { userId: m.id });
  await call(cookie, `/api/boards/${board.id}/members`, { userId: t.id });
  const cols = [...board.columns].sort((a: any, b: any) => a.order - b.order);
  const review = (await call(cookie, "/api/columns", { boardId: board.id, name: "En revue", kind: "DOING" })).column;
  await call(cookie, `/api/columns/${review.id}`, { color: "#f59e0b" }, "PATCH");
  await call(cookie, `/api/columns/${review.id}`, { order: 2 }, "PATCH");

  const L: Record<string, string> = {};
  for (const [name, color] of [["Design", "#8b5cf6"], ["Urgent", "#f43f5e"], ["Backend", "#3380fc"], ["Doc", "#f59e0b"], ["Mobile", "#06b6d4"]]) {
    L[name] = (await call(cookie, "/api/labels", { boardId: board.id, name, color })).label.id;
  }
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const cards: [string, string, string[], number | null, [number, number] | null, number, string | null][] = [
    [cols[0].id, "Maquetter la page d'accueil", ["Design"], 4, [1, 4], 2, m.id],
    [cols[0].id, "Choisir l'hébergeur des images", ["Backend"], null, null, 0, t.id],
    [cols[0].id, "Rédiger la doc API", ["Doc"], 10, null, 0, o.id],
    [cols[0].id, "Tester l'affichage sur Android", ["Mobile"], null, [0, 3], 0, null],
    [cols[1].id, "Corriger le bug de connexion", ["Urgent", "Backend"], -3, [3, 5], 3, o.id],
    [cols[1].id, "Intégrer le nouveau logo", ["Design"], null, [2, 2], 0, m.id],
    [cols[1].id, "Migrer la base vers Postgres 16", ["Backend"], 0, null, 0, t.id],
    [review.id, "Page de profil utilisateur", ["Design"], null, null, 2, m.id],
    [review.id, "Notifications par équipe", ["Backend"], null, [5, 6], 0, o.id],
    [cols[2].id, "Installer Kanby sur Coolify", ["Backend"], null, null, 0, o.id],
    [cols[2].id, "Définir la palette de couleurs", ["Design"], null, null, 0, m.id],
  ];
  for (const [col, title, labels, due, check, comments, who] of cards) {
    const { card } = await call(cookie, "/api/cards", { columnId: col, title });
    for (const l of labels) await call(cookie, `/api/cards/${card.id}/labels`, { labelId: L[l] });
    if (due !== null) await call(cookie, `/api/cards/${card.id}`, { dueDate: day(due) }, "PATCH");
    if (check) {
      for (let i = 0; i < check[1]; i++) {
        const { item } = await call(cookie, "/api/checklist", { cardId: card.id, text: `Étape ${i + 1}` });
        if (i < check[0]) await call(cookie, `/api/checklist/${item.id}`, { done: true }, "PATCH");
      }
    }
    for (let i = 0; i < comments; i++) await call(cookie, "/api/comments", { cardId: card.id, text: i ? "C'est noté, je regarde demain." : "Je m'en occupe cette semaine 👍" });
    if (who) await call(cookie, `/api/cards/${card.id}/assign`, { userId: who });
  }
  await call(cookie, `/api/cards/${(await prisma.card.findFirst({ where: { title: "Corriger le bug de connexion", boardId: board.id } }))!.id}`, {
    description: "Les utilisateurs sont déconnectés après 5 minutes sur Safari.\n\nPiste : cookie SameSite.",
  }, "PATCH");
  await call(cookie, "/api/boards", { name: "Courses de la semaine", type: "PERSONAL" });
  await call(cookie, "/api/boards", { name: "Planning restaurant", type: "PERSONAL" });
  // Mark the owner's notifications as unread-rich: a few from Claire.
  const mc = await login(m.email, password);
  const someCard = await prisma.card.findFirst({ where: { boardId: board.id, title: "Page de profil utilisateur" } });
  await call(mc, "/api/comments", { cardId: someCard!.id, text: "Prête pour relecture !" });
  await prisma.$disconnect();
  return {
    owner: { email: o.email, password, id: o.id },
    member: { email: m.email, password, id: m.id },
    boardId: board.id,
  };
}

if (process.argv[1]?.endsWith("demo-data.ts")) {
  createDemo("shot").then((d) => console.log(JSON.stringify(d)));
}
