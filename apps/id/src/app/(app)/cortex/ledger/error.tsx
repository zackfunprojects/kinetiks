"use client";

import { SegmentError } from "@/components/app-shell/route-boundaries";

export default function CortexLedgerError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError label="your ledger" route="/cortex/ledger" {...props} />;
}
