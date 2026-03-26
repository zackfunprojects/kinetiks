import { PipelineView } from "@/components/pipeline/PipelineView";

export default function PipelinePage() {
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
          Pipeline
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            marginTop: "4px",
          }}
        >
          Manage deals and track revenue.
        </p>
      </div>
      <PipelineView />
    </div>
  );
}
