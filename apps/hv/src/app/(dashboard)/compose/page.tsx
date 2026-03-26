import { ComposeView } from "@/components/composer/ComposeView";

interface ComposePageProps {
  searchParams: { contact_id?: string };
}

export default function ComposePage({ searchParams }: ComposePageProps) {
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
          Compose Email
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            marginTop: "4px",
          }}
        >
          Generate personalized outreach with AI and Sentinel quality checks.
        </p>
      </div>
      <ComposeView initialContactId={searchParams.contact_id} />
    </div>
  );
}
