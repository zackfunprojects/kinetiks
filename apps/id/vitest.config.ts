import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only throws when imported outside an RSC context; under
      // vitest's "node" environment the guard is noise. Stub to an empty
      // module so server-side helpers can be unit-tested directly.
      "server-only": path.resolve(__dirname, "./src/test-utils/server-only-stub.ts"),
    },
  },
});
