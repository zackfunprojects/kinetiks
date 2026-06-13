"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@kinetiks/ui";
import { capture } from "@/lib/observability/posthog";

/**
 * E1 — surfaces the Stripe Checkout round-trip outcome. Checkout's
 * success/cancel URLs land on /chat?checkout=success|cancelled; this
 * reads the flag once, shows a toast, fires the analytics event, and
 * strips the param so refresh/back doesn't re-announce.
 *
 * The plan itself lands asynchronously via the Stripe webhook, so the
 * success copy promises confirmation, not instant state ("now active"
 * would be a false promise if the webhook is seconds behind).
 */
function CheckoutReturnToastInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const announced = useRef(false);

  const outcome = searchParams.get("checkout");

  useEffect(() => {
    if (!outcome || announced.current) return;
    if (outcome !== "success" && outcome !== "cancelled") return;
    announced.current = true;

    void capture("billing.checkout_returned", { outcome });
    push(
      outcome === "success"
        ? {
            title: "Payment received",
            body: "Your subscription is being confirmed. Plan details update in Settings → Billing within a minute.",
            tone: "success",
          }
        : {
            title: "Checkout cancelled",
            body: "No charge was made. You can pick a plan any time in Settings → Billing.",
            tone: "neutral",
          },
    );

    const params = new URLSearchParams(searchParams.toString());
    params.delete("checkout");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [outcome, pathname, push, router, searchParams]);

  return null;
}

export function CheckoutReturnToast() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <CheckoutReturnToastInner />
    </Suspense>
  );
}
