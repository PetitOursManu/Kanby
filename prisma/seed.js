// Standalone CommonJS seed script — runs in the production Docker image
// (no tsx/typescript needed). Mirrors lib/seed-admin.ts.
//
// Creates the default admin once. If DEFAULT_ADMIN_PASSWORD is empty, a
// random password is generated and printed in the logs (never a known
// default password on a public instance). The admin must change it at the
// first sign-in.
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  if ((process.env.AUTO_ADMIN_ON_BOOT ?? "true").toLowerCase() === "false") {
    console.log("[seed] AUTO_ADMIN_ON_BOOT=false — ignoré.");
    return;
  }
  const email = (process.env.DEFAULT_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    console.log("[seed] Aucun DEFAULT_ADMIN_EMAIL — ignoré.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] L'admin ${email} existe déjà — ignoré.`);
    return;
  }

  let password = process.env.DEFAULT_ADMIN_PASSWORD || "";
  const generated = !password;
  if (generated) password = crypto.randomBytes(12).toString("base64url");

  await prisma.user.create({
    data: {
      email,
      displayName: (process.env.DEFAULT_ADMIN_NAME || "Administrateur").trim(),
      passwordHash: await bcrypt.hash(password, 10),
      globalRole: "ADMIN",
      mustChangePwd: true,
    },
  });
  console.log(`[seed] Admin par défaut créé : ${email}`);
  if (generated) {
    console.log("[seed] ================================================");
    console.log(`[seed]  Mot de passe temporaire : ${password}`);
    console.log("[seed]  Il vous sera demandé de le changer à la 1re connexion.");
    console.log("[seed] ================================================");
  }
}

main()
  .catch((e) => {
    console.error("[seed] Erreur :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
