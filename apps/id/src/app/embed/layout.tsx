/**
 * Embed route layout (Phase 8.0).
 *
 * The reference collaborative surface (and, later, real suite-app embed
 * surfaces) render here — OUTSIDE the (app) three-tab shell. The Kinetiks
 * shell that mounts this surface in the app panel provides the chrome; the
 * embed hides its own nav (spec §4.4 `mode=collaborative`). The root layout
 * still supplies design tokens + theme.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--kt-bg-base)",
        color: "var(--kt-fg-1)",
      }}
    >
      {children}
    </div>
  );
}
