export default function AnalyticsTabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div style={{ height: "100%", overflow: "auto", padding: 32 }}>{children}</div>;
}
