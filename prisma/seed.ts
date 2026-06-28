import { PrismaClient } from "@prisma/client";
import { seedDefaultAdmin } from "@/lib/seed-admin";

// Use a dedicated client for seeding (the singleton may not be initialized
// yet in the seed context).
const prisma = new PrismaClient();

async function main() {
  await seedDefaultAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });