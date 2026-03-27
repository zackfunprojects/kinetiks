import { ContactDetail } from "@/components/contacts/ContactDetail";

export default function ContactDetailPage({ params }: { params: { id: string } }) {
  return <ContactDetail contactId={params.id} />;
}
