import { Skeleton } from "@kinetiks/ui";

/**
 * Loading UI for the chat thread route while the server loader resolves
 * (ownership check + threads + messages).
 */
export default function ChatThreadLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading conversation"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--kt-gap-3, 12px)",
        padding: "var(--kt-gap-6, 24px)",
      }}
    >
      <Skeleton height={18} width="35%" />
      <Skeleton height={56} width="100%" />
      <Skeleton height={56} width="82%" />
      <Skeleton height={56} width="90%" />
    </div>
  );
}
