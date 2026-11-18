import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * End-to-end UI suite (real Chromium via the `playwright` package).
 *   KANBY_TEST_URL=http://localhost:3005 DATABASE_URL=... JWT_SECRET=... npm run test:e2e
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
