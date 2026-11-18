import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Idempotently create the default admin account from environment variables
 * (non-Docker deployments; the Docker entrypoint runs prisma/seed.js).
 * Without DEFAULT_ADMIN_PASSWORD a random password is generated and logged.
 */
export async function seedDefaultAdmin(): Promise<void> {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  let password = process.env.DEFAULT_ADMIN_PASSWORD || "";
  const generated = !password;
  if (generated) password = crypto.randomBytes(12).toString("base64url");

  await prisma.user.create({
    data: {
      email,
      displayName: process.env.DEFAULT_ADMIN_NAME?.trim() || "Administrateur",
      passwordHash: await bcrypt.hash(password, 10),
      globalRole: "ADMIN",
      mustChangePwd: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[seed] Default admin created: ${email}${generated ? ` — temporary password: ${password}` : ""}`);
}
