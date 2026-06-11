"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexIntegrationsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your integrations" {...props} />;
}
