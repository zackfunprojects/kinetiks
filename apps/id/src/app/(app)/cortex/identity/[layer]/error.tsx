"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexIdentityLayerError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="this identity layer" {...props} />;
}
