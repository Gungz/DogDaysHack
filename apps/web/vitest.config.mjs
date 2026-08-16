import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    testTimeout: 300_000,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.env.ts"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
