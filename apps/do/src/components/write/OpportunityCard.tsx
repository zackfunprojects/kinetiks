"use client";

import type { Opportunity } from "@kinetiks/deskof";

interface Props {
  opportunity: Opportunity;
  /** Show the locked-suggested-angle teaser (free tier) */
  angleLocked: boolean;
}

/**
 * Opportunity card — the atomic unit of the Write tab.
 *
 * Mobile-first per Quality Addendum #3:
 *   - Full-bleed on mobile, no horizontal padding
 *   - Thread context occupies the upper two-thirds, action buttons live
 *     in the bottom third (set by the parent CardStack layout)
 *   - The match score is displayed prominently as a single number with
 *     the dimension breakdown available on tap (Phase 4)
 *
 * The card is presentational only — all swipe / skip / write actions
 * are owned by the parent CardStack. This keeps the card stateless and
 * trivially testable.
 */
export function OpportunityCard({ opportunity, angleLocked }: Props) {
  const { thread, match_score, suggested_angle, opportunity_type } = opportunity;

  return (
    <article
      className="flex flex-col gap-4 rounded-2xl p-5"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={thread.platform} />
            <span
              className="text-xs font-medium"
              style={{ color: "var(--text-tertiary)" }}
            >
              {thread.community}
            </span>
            {opportunity_type === "personal" && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: "var(--accent-subtle)",
                  color: "var(--accent)",
                }}
              >
                personal
              </span>
            )}
          </div>
          <h3
            className="text-base font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {thread.title}
          </h3>
        </div>
        <MatchScoreBadge score={match_score} />
      </header>

      {thread.body && (
        <p
          className="line-clamp-3 text-sm leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {thread.body}
        </p>
      )}

      <SuggestedAngle angle={suggested_angle} locked={angleLocked} />

      <footer
        className="flex items-center gap-3 text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        <span>{thread.score} {thread.platform === "reddit" ? "upvotes" : "views"}</span>
        <span>·</span>
        <span>{thread.comment_count} {thread.platform === "reddit" ? "comments" : "answers"}</span>
      </footer>
    </article>
  );
}

function PlatformBadge({ platform }: { platform: "reddit" | "quora" }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-semibold uppercase"
      style={{
        background: platform === "reddit" ? "#FF4500" : "#A82400",
        color: "#ffffff",
      }}
    >
      {platform}
    </span>
  );
}

function MatchScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "var(--accent)",
        color: "#ffffff",
      }}
      aria-label={`Match score ${score}`}
    >
      <span className="text-base font-bold">{score}</span>
    </div>
  );
}

function SuggestedAngle({
  angle,
  locked,
}: {
  angle: string | null;
  locked: boolean;
}) {
  if (locked) {
    return (
      <div
        className="rounded-xl border p-3 text-sm"
        style={{
          borderColor: "var(--border)",
          background: "var(--accent-subtle)",
          color: "var(--text-secondary)",
        }}
      >
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          Suggested angle locked.
        </span>{" "}
        Available on Standard.
      </div>
    );
  }
  if (!angle) return null;
  return (
    <div
      className="rounded-xl border-l-4 p-3 text-sm"
      style={{
        borderLeftColor: "var(--accent)",
        background: "var(--accent-subtle)",
        color: "var(--text-primary)",
      }}
    >
      <span className="font-semibold">Angle:</span> {angle}
    </div>
  );
}
