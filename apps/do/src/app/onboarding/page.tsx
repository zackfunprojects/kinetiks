import { redirect } from "next/navigation";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getOrCreateOnboardingState } from "@/lib/onboarding/state";

/**
 * Onboarding entry — routes the user to the current incomplete step.
 *
 * Each step has its own page so users can deep-link, refresh, and the
 * back button works naturally. The orchestrator just sends them to the
 * right one based on their persisted state.
 */
export default async function OnboardingEntryPage() {
  const auth = await requireDeskOfSession();
  if ("error" in auth) {
    // Anonymous: route to Kinetiks ID sign-in with a return URL.
    redirect("https://id.kinetiks.ai/login?return_to=/onboarding");
  }

  const supabase = createDeskOfServerClient();
  const state = await getOrCreateOnboardingState(supabase, auth.session.user_id);

  if (state.current_step === "complete") {
    redirect("/write");
  }

  redirect(`/onboarding/${state.current_step}`);
}
