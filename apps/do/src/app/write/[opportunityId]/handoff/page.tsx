import { notFound, redirect } from "next/navigation";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getOpportunityById } from "@/lib/opportunities/queue";
import { HandoffConfirmation } from "@/components/write/HandoffConfirmation";

export const dynamic = "force-dynamic";

interface Props {
  params: { opportunityId: string };
}

/**
 * Quora handoff confirmation page.
 *
 * After the user clicks Post in the editor, ReplyEditor opens the
 * Quora question in a new tab and routes here. This page:
 *
 *   1. Reminds the user of the next step (paste + submit on Quora)
 *   2. Offers a manual "Open Quora" link in case the popup was blocked
 *   3. Renders an "I posted this" button that triggers the Quora
 *      3-layer answer match flow (Phase 5 will wire the actual Pulse
 *      job; Phase 2.5 just records the confirmation timestamp so the
 *      job has something to start from)
 *
 * Uses the unrestricted getOpportunityById since the row may have
 * already been moved out of the actionable status set by the post.
 */
export default async function HandoffPage({ params }: Props) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) redirect("/onboarding");

  const supabase = createDeskOfServerClient();
  const opportunity = await getOpportunityById(
    supabase,
    auth.session.user_id,
    params.opportunityId
  );
  if (!opportunity) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <HandoffConfirmation
        opportunityId={opportunity.id}
        threadUrl={opportunity.thread.url}
        threadTitle={opportunity.thread.title}
      />
    </main>
  );
}
