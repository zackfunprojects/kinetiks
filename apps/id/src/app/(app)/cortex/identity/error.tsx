"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexIdentityError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your identity layers" route="/cortex/identity" {...props} />;
}
