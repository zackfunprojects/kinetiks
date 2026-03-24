import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: billing } = await admin
    .from("kinetiks_billing")
    .select("stripe_customer_id")
    .eq("account_id", account.id)
    .single();

  if (!billing?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer found. Please contact support." },
      { status: 400 }
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: isAbort ? "Stripe request timed out" : "Failed to reach Stripe" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }

  const session = await response.json();
  return NextResponse.json({ url: session.url });
}
