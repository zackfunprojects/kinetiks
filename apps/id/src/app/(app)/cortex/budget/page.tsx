import { BudgetManager } from "@/components/cortex/BudgetManager";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: "var(--kt-fs-24)",
          fontWeight: "var(--kt-fw-bold)",
          color: "var(--kt-fg-1)",
          margin: "0 0 var(--kt-s-2)",
        }}
      >
        Budget
      </h1>
      <p
        style={{
          fontSize: "var(--kt-fs-14)",
          color: "var(--kt-fg-2)",
          margin: "0 0 var(--kt-s-6)",
        }}
      >
        Spend allocation and tracking across categories
      </p>
      <BudgetManager />
    </div>
  );
}
