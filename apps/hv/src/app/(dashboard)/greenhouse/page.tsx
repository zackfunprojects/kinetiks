import { ContactsTable } from "@/components/contacts/ContactsTable";
import IcpPanel from "@/components/greenhouse/IcpPanel";
import BulkEnrichPanel from "@/components/greenhouse/BulkEnrichPanel";

export default function GreenhousePage() {
  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{
          fontSize: 22, fontWeight: 600, color: "var(--text-primary)",
          margin: 0, letterSpacing: "-0.02em",
        }}>
          Contacts
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Build and manage your prospect lists. Enrich with company data and score against your ICP.
        </p>
      </div>

      {/* ICP summary + Bulk enrichment */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 380px",
        gap: "var(--space-5)",
        marginBottom: "var(--space-6)",
      }}>
        <IcpPanel />
        <BulkEnrichPanel />
      </div>

      {/* Contacts table */}
      <ContactsTable />
    </div>
  );
}
