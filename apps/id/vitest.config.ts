import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // e2e/ holds Playwright specs (run by `pnpm e2e`, not vitest). Keep the
    // vitest defaults and add the e2e dir so its *.spec.ts are not collected.
    exclude: [...configDefaults.exclude, "e2e/**"],
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
