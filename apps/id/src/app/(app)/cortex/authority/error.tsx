"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexAuthorityError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your authority settings" route="/cortex/authority" {...props} />;
}
