import { redirect } from "next/navigation";

export default function ProspectsRedirect() {
  redirect("/greenhouse?tab=sprouts");
}
