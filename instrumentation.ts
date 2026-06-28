/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Used to self-initialize the database on `docker compose up` so that
 * non-technical users don't need to run migrations manually.
 *
 * Behavior is gated by env vars so it never interferes with local dev:
 *  - AUTO_ADMIN_ON_BOOT=true  → run migrate deploy + seed default admin.
 *
 * The Docker entrypoint also runs these steps before `next start`, so this
 * hook is a belt-and-suspenders path for non-Docker deployments.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const autoBoot = process.env.AUTO_ADMIN_ON_BOOT === "true";
  if (!autoBoot) return;

  try {
    // Import lazily so this code is never loaded in the browser runtime.
    const { execSync } = await import("node:child_process");
    const { seedDefaultAdmin } = await import("@/lib/seed-admin");

    // eslint-disable-next-line no-console
    console.log("[boot] Running prisma migrate deploy...");
    execSync("npx prisma migrate deploy", { stdio: "inherit" });

    // eslint-disable-next-line no-console
    console.log("[boot] Seeding default admin if needed...");
    await seedDefaultAdmin();

    // eslint-disable-next-line no-console
    console.log("[boot] Database ready.");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[boot] Database initialization failed:", err);
    // Don't crash the server — let the app start and surface errors per-request.
  }
}