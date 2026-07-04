import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Idempotently create the default admin account from environment variables.
 * Called by `prisma/seed.js` and by the Docker entrypoint on first boot.
 * Safe to run multiple times: only creates the admin if no user with that
 * email exists yet.
 */
export async function seedDefaultAdmin(): Promise<void> {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.trim();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!email || !password) {
    // No default admin configured — skip silently.
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      displayName: process.env.DEFAULT_ADMIN_NAME?.trim() || "Administrateur",
      passwordHash,
      globalRole: "ADMIN",
      // Force a password change on first login for the env-seeded admin.
      mustChangePwd: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed] Default admin created: ${email}`);
}