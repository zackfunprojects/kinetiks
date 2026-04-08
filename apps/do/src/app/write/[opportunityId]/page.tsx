import { notFound, redirect } from "next/navigation";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import {
  acceptOpportunity,
  getOpportunityById,
} from "@/lib/opportunities/queue";
import { ReplyEditor } from "@/components/write/ReplyEditor";

interface Props {
  params: { opportunityId: string };
}

export default async function ReplyEditorPage({ params }: Props) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) redirect("/onboarding");

  const supabase = createDeskOfServerClient();
  const opportunity = await getOpportunityById(
    supabase,
    auth.session.user_id,
    params.opportunityId
  );
  if (!opportunity) notFound();

  // Mark the opportunity accepted (the user opened the editor).
  await acceptOpportunity(
    supabase,
    auth.session.user_id,
    params.opportunityId
  );

  return <ReplyEditor opportunity={opportunity} />;
}
