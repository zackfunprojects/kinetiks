import { ContactDetail } from "@/components/contacts/ContactDetail";

interface ContactDetailPageProps {
  params: { id: string };
}

export default function ContactDetailPage({ params }: ContactDetailPageProps) {
  return (
    <div>
      <a
        href="/contacts"
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-tertiary)",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: "16px",
        }}
      >
        ← Back to contacts
      </a>
      <ContactDetail contactId={params.id} />
    </div>
  );
}
