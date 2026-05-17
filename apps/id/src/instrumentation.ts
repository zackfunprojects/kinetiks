/**
 * Next.js instrumentation entry. Runs on every server boot in BOTH the
 * Node and Edge runtimes — so the body must NOT import any module that
 * touches Node-only APIs (node:crypto, node:fs, native bindings,
 * @grpc/grpc-js, anything in @kinetiks/* that reaches them).
 *
 * Standard Next.js 14+ pattern: keep this file tiny; conditionally load
 * a Node-only sibling under a process.env.NEXT_RUNTIME guard. Next.js's
 * runtime-aware code splitting ensures the sibling module is never
 * bundled into the Edge chunk.
 *
 * The actual wiring lives in ./instrumentation-node.ts.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootNodeInstrumentation } = await import(
      "./instrumentation-node"
    );
    bootNodeInstrumentation();
  }
}
