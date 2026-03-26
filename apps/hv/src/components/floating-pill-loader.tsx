"use client";

import { useEffect, useState } from "react";
import { FloatingPill } from "@kinetiks/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Loads user account data and renders the FloatingPill.
 * Wrapped in a client component so the server layout stays a server component.
 */
export function FloatingPillLoader() {
  const [accountData, setAccountData] = useState<{
    codename: string;
    confidenceScore: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: account } = await supabase
        .from("kinetiks_accounts")
        .select("id, codename")
        .eq("user_id", user.id)
        .single();

      if (!account) return;

      const { data: confidence } = await supabase
        .from("kinetiks_confidence")
        .select("aggregate")
        .eq("account_id", account.id)
        .single();

      setAccountData({
        codename: account.codename,
        confidenceScore: confidence?.aggregate ?? 0,
      });
    }
    load();
  }, []);

  if (!accountData) return null;

  return (
    <FloatingPill
      codename={accountData.codename}
      confidenceScore={accountData.confidenceScore}
      currentApp="harvest"
      idBaseUrl={process.env.NEXT_PUBLIC_ID_URL || "https://id.kinetiks.ai"}
    />
  );
}
