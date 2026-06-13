import { redirect } from "next/navigation";

// /admin → the v1 surface. The layout already gated admin access.
export default function AdminIndex() {
  redirect("/admin/models");
}
