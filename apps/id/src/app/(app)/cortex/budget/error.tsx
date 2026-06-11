"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexBudgetError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your budget" route="/cortex/budget" {...props} />;
}
