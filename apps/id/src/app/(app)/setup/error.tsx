"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function SetupError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="setup" route="/setup" {...props} />;
}
