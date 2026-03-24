import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const { data: billing } = await admin
    .from("kinetiks_billing")
    .select("stripe_customer_id")
    .eq("account_id", auth.account_id)
    .single();

  if (!billing?.stripe_customer_id) {
    return apiError("No Stripe customer found. Please contact support.", 400);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return apiError("Stripe not configured", 500);
  }

  // Create Stripe Customer Portal session via API
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: billing.stripe_customer_id,
          return_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://id.kinetiks.ai"}/billing`,
        }).toString(),
        signal: controller.signal,
      }
    );
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    console.error(
      "Stripe portal request failed:",
      isAbort ? "timed out after 5s" : err
    );
    return apiError(isAbort ? "Stripe request timed out" : "Failed to reach Stripe", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return apiError("Failed to create portal session", 500);
  }

  const session = await response.json();
  return apiSuccess({ url: session.url });
}
