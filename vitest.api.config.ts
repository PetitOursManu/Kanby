import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * API integration suite — needs a running Kanby server and its database.
 *   KANBY_TEST_URL=http://localhost:3005 DATABASE_URL=... JWT_SECRET=... npm run test:api
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
  test: {
    environment: "node",
    include: ["tests/api/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
