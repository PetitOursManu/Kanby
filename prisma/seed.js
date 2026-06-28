// Standalone CommonJS seed script — runs in the production Docker image
// (no tsx/typescript needed). Mirrors lib/seed-admin.ts logic.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.DEFAULT_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed] Aucun admin par défaut configuré — ignoré.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] L'admin ${email} existe déjà — ignoré.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      displayName: (process.env.DEFAULT_ADMIN_NAME || "Administrateur").trim(),
      passwordHash,
      globalRole: "ADMIN",
      mustChangePwd: true,
    },
  });
  console.log(`[seed] Admin par défaut créé : ${email}`);
}

main()
  .catch((e) => {
    console.error("[seed] Erreur :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });