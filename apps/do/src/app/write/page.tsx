import { redirect } from "next/navigation";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getPendingOpportunities } from "@/lib/opportunities/queue";
import { countTodaysFilteredThreads } from "@/lib/opportunities/filtered";
import { canAccess } from "@/lib/tier-config";
import { WriteTabClient } from "./client";
import { FilteredFeedTrigger } from "@/components/write/FilteredFeedTrigger";

export const dynamic = "force-dynamic";

/**
 * Write tab — the core DeskOf product surface.
 *
 * Server component fetches the user's session, validates tier access,
 * loads the top-N pending opportunities, and hands them off to the
 * client component (CardStack) for the swipe / skip / write loop.
 *
 * Phase 2 ships the loop end-to-end with Quora opportunities. Reddit
 * opportunities will appear automatically once the Reddit OAuth follow-up
 * lands and Scout starts ingesting Reddit threads — no Write tab change
 * required, the platform abstraction handles it.
 */
export default async function WriteTabPage() {
  const result = await requireDeskOfSession();
  if ("error" in result) redirect("/onboarding");
  const { session } = result;

  const supabase = createDeskOfServerClient();
  const [opportunities, filteredCount] = await Promise.all([
    getPendingOpportunities(supabase, session.user_id, 10),
    countTodaysFilteredThreads(supabase, session.user_id),
  ]);

  // Free tier never sees suggested angles — the angle teaser fires
  // the upgrade-to-Standard conversion trigger inside the card itself.
  const angleLocked = !canAccess("suggested_angles", session.tier);

  return (
    <main className="flex h-screen flex-col">
      <header
        className="flex shrink-0 items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h1
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Write
        </h1>
        <div className="flex items-center gap-2">
          <FilteredFeedTrigger initialCount={filteredCount} />
          <span
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            {opportunities.length} ready
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <WriteTabClient
          initialOpportunities={opportunities}
          angleLocked={angleLocked}
        />
      </div>
    </main>
  );
}
