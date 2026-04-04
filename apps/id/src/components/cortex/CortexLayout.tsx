"use client";

import { CortexNav } from "./CortexNav";

interface CortexLayoutProps {
  children: React.ReactNode;
}

export function CortexLayout({ children }: CortexLayoutProps) {
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <CortexNav />
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 32,
        }}
      >
        {children}
      </div>
    </div>
  );
}
