"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function AnalyticsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your analytics" route="/analytics" {...props} />;
}
