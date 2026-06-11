"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function ChatError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your chats" {...props} />;
}
