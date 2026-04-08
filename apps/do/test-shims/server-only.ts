/**
 * Test-only shim for the `server-only` npm package.
 *
 * The real package throws synchronously on import outside a server
 * context, which makes vitest unable to load any module that has
 * `import "server-only"` at its top. The shim does nothing — vitest
 * resolves `server-only` to this file via the alias in vitest.config.ts.
 *
 * This shim is NEVER bundled into the Next.js build because Next sees
 * the original package via tsconfig + node_modules.
 */
export {};
