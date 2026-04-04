import { CortexLayout } from "@/components/cortex/CortexLayout";

export default function CortexTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CortexLayout>{children}</CortexLayout>;
}
