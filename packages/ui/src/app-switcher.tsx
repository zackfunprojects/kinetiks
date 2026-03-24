"use client";

interface AppInfo {
  name: string;
  displayName: string;
  url: string;
  color?: string;
}

interface AppSwitcherProps {
  activeApps: AppInfo[];
  inactiveApps: Array<{ name: string; displayName: string }>;
  currentApp?: string;
}

export function AppSwitcher({
  activeApps,
  inactiveApps,
  currentApp,
}: AppSwitcherProps) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {activeApps.map((app) => {
        const isCurrent = app.name === currentApp;
        return (
          <a
            key={app.name}
            href={app.url}
            title={app.displayName}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: app.color || "#6C5CE7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
              border: isCurrent ? "2px solid #6C5CE7" : "2px solid transparent",
              boxShadow: isCurrent ? "0 0 0 2px rgba(108,92,231,0.3)" : undefined,
              transition: "transform 0.15s",
            }}
          >
            {app.displayName[0]}
          </a>
        );
      })}
      {inactiveApps.map((app) => (
        <div
          key={app.name}
          title={`${app.displayName} - not activated`}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "#E5E7EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9CA3AF",
            fontWeight: 700,
            fontSize: 13,
            cursor: "default",
          }}
        >
          {app.displayName[0]}
        </div>
      ))}
    </div>
  );
}
