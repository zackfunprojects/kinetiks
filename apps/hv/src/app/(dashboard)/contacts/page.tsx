import { ContactsTable } from "@/components/contacts/ContactsTable";

export default function ContactsPage() {
  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Contacts
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            marginTop: "4px",
          }}
        >
          Manage prospects and enriched contacts.
        </p>
      </div>
      <ContactsTable />
    </div>
  );
}
