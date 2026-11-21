import { prisma } from "@/lib/prisma";

/** Default from the environment: on unless ALLOW_REGISTRATION=false. */
export function registrationAllowedByEnv(): boolean {
  return (process.env.ALLOW_REGISTRATION ?? "true").toLowerCase() !== "false";
}

/**
 * Is public sign-up open? The admin page setting wins; when it was never set,
 * the ALLOW_REGISTRATION environment variable decides. Admins can always
 * create accounts from the admin page.
 */
export async function registrationAllowed(): Promise<boolean> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { allowRegistration: true } });
    if (row?.allowRegistration != null) return row.allowRegistration;
  } catch {
    /* table missing (migration not applied yet): fall back to the env var */
  }
  return registrationAllowedByEnv();
}

/** Open or close public sign-up (admin page and admin in Kosmy Board). */
export async function setRegistrationAllowed(allowRegistration: boolean): Promise<void> {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, allowRegistration },
    update: { allowRegistration },
  });
}
