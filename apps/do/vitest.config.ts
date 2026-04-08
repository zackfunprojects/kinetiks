import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    setupFiles: [],
    server: {
      deps: {
        // server-only throws on import outside a server context. Stub
        // it for the test runner so we can unit-test modules that
        // declare `import "server-only"`.
        inline: ["server-only"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub the server-only package so it can be imported by test
      // files that exercise lib/reply/confirmation-token.ts and
      // similar server-side modules.
      "server-only": path.resolve(__dirname, "./test-shims/server-only.ts"),
    },
  },
});
