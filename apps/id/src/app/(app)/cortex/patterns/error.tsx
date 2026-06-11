"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexPatternsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your patterns" {...props} />;
}
