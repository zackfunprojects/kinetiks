import { DotProgress } from "./DotProgress";

interface StepWrapperProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  isOptional?: boolean;
  onBack?: () => void;
  onSkip?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  loading?: boolean;
  hideContinue?: boolean;
  children: React.ReactNode;
}

export function StepWrapper({
  stepNumber,
  totalSteps,
  title,
  subtitle,
  isOptional,
  onBack,
  onSkip,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  loading,
  hideContinue,
  children,
}: StepWrapperProps) {
  return (
    <div>
      <DotProgress currentStep={stepNumber - 1} totalSteps={totalSteps} />

      <div className="mx-auto max-w-2xl px-4 pb-16">
        <div
          className="rounded-xl"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
          }}
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-0">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isOptional && (
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "var(--bg-surface-raised)",
                      color: "var(--text-tertiary)",
                      border: "1px solid var(--border-muted)",
                      fontFamily: "var(--font-mono), monospace",
                    }}
                  >
                    Optional
                  </span>
                )}
              </div>
              <span
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono), monospace",
                }}
              >
                Step {stepNumber} of {totalSteps}
              </span>
            </div>

            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {subtitle}
              </p>
            )}
          </div>

          {/* Content */}
          <div className="px-8 pt-6 pb-2">
            {children}
          </div>

          {/* Navigation */}
          <div
            className="mt-2 flex items-center justify-between px-8 py-5"
            style={{ borderTop: "1px solid var(--border-muted)" }}
          >
            <div>
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {onSkip && (
                <button
                  onClick={onSkip}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                  Skip
                </button>
              )}
              {!hideContinue && onContinue && (
                <button
                  onClick={onContinue}
                  disabled={continueDisabled || loading}
                  className="flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--accent-emphasis)",
                    color: "var(--text-on-accent)",
                    border: "none",
                    cursor: continueDisabled || loading ? "default" : "pointer",
                  }}
                >
                  {loading ? (
                    <>
                      <div
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
                        style={{ borderColor: "var(--text-on-accent)", borderTopColor: "transparent" }}
                      />
                      {continueLabel}
                    </>
                  ) : (
                    <>
                      {continueLabel}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
