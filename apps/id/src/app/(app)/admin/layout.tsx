import { notFound } from "next/navigation";

import { getAdminContext } from "@/lib/auth/admin";
import { AdminLayout } from "@/components/admin/AdminLayout";

/**
 * Server gate for the /admin operator console. Non-admins (and signed-out
 * users) get notFound() rather than a redirect, so the panel's existence
 * isn't advertised. The parent (app) layout already enforced auth +
 * onboarding; this adds the admin-membership check on top.
 */
export default async function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContext();
  if (!ctx) notFound();
  return <AdminLayout role={ctx.role}>{children}</AdminLayout>;
}
