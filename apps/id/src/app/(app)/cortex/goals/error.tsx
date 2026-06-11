"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexGoalsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your goals" route="/cortex/goals" {...props} />;
}
