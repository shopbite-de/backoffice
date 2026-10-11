import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pure server-side logic only; Nitro auto-imports are stubbed per test with vi.stubGlobal.
export default defineConfig({
  resolve: {
    alias: { "#shared": fileURLToPath(new URL("./shared", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
