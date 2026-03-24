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
              borderRadius: 6,
              background: app.color || "var(--accent-emphasis, #e6edf3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-on-accent, #ffffff)",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "var(--font-mono, monospace), monospace",
              textDecoration: "none",
              border: isCurrent ? "2px solid var(--accent, #e6edf3)" : "2px solid transparent",
              boxShadow: isCurrent ? "0 0 0 2px rgba(230,237,243,0.15)" : undefined,
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
            borderRadius: 6,
            background: "var(--border-default, #30363d)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-tertiary, #484f58)",
            fontWeight: 700,
            fontSize: 13,
            fontFamily: "var(--font-mono, monospace), monospace",
            cursor: "default",
          }}
        >
          {app.displayName[0]}
        </div>
      ))}
    </div>
  );
}
