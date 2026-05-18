import { BudgetManager } from "@/components/cortex/BudgetManager";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--kt-fg-1)",
          margin: "0 0 8px",
        }}
      >
        Budget
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--kt-fg-2)",
          margin: "0 0 32px",
        }}
      >
        Spend allocation and tracking across categories
      </p>
      <BudgetManager />
    </div>
  );
}
