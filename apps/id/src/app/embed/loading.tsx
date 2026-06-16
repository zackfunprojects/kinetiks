export default function EmbedLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading workspace"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--kt-fg-3)",
        fontSize: "var(--kt-fs-13)",
      }}
    >
      Loading workspace…
    </div>
  );
}
