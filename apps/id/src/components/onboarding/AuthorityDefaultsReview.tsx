"use client";

import { DefaultGrantToggleCard, type DefaultGrantCardCapability } from "./DefaultGrantToggleCard";

export interface AuthorityDefaultsSection {
  app: string;
  display_name: string;
  defaults: ReadonlyArray<{
    key: string;
    description: string;
    capabilities: readonly DefaultGrantCardCapability[];
  }>;
}

export interface AuthorityDefaultsReviewProps {
  sections: readonly AuthorityDefaultsSection[];
  /** Controlled set of opted-in keys; parent owns mutation. */
  acceptedKeys: ReadonlySet<string>;
  onToggleKey: (key: string, next: boolean) => void;
}

/**
 * The list of manifest sections + their defaults rendered as toggles
 * for the onboarding Permissions step per the Kinetiks Contract
 * Addendum §2.6.
 *
 * In v1 there is exactly one section (Kinetiks Core). The component
 * is structured for multi-section future use — when Harvest, Dark
 * Madder, etc., land with their own defaults, each manifest renders
 * its own block with its own display name header. The Authority
 * Agent's per-app proposal cadence (the diff cron) generates one
 * proposal per app at a time too, so the section grouping is the
 * canonical shape for both surfaces.
 */
export function AuthorityDefaultsReview({
  sections,
  acceptedKeys,
  onToggleKey,
}: AuthorityDefaultsReviewProps) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.app} className="space-y-3">
          {/* Per-section header. v1 only has one section so the
              header is mostly decorative; with multiple apps it
              becomes the app boundary. */}
          {sections.length > 1 && (
            <h3
              className="text-[12px] font-semibold uppercase tracking-wider"
              style={{
                color: "var(--kt-fg-3)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {section.display_name}
            </h3>
          )}
          <div className="space-y-3">
            {section.defaults.map((d) => (
              <DefaultGrantToggleCard
                key={d.key}
                permissionKey={d.key}
                description={d.description}
                capabilities={d.capabilities}
                on={acceptedKeys.has(d.key)}
                onToggle={(next) => onToggleKey(d.key, next)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
