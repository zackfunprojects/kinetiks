interface ProgressBarProps {
  currentStep: number;
  steps: string[];
}

export function ProgressBar({ currentStep, steps }: ProgressBarProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-6">
      {steps.map((label, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;

        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: isCompleted
                    ? "var(--accent-emphasis)"
                    : isCurrent
                      ? "var(--accent-muted)"
                      : "var(--bg-surface-raised)",
                  color: isCompleted
                    ? "var(--text-on-accent)"
                    : isCurrent
                      ? "var(--accent)"
                      : "var(--text-tertiary)",
                  border: isCurrent ? "2px solid var(--accent)" : "1px solid var(--border-default)",
                  fontFamily: "var(--font-mono), monospace",
                }}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className="text-[10px] font-medium"
                style={{
                  color: isCompleted || isCurrent ? "var(--accent)" : "var(--text-tertiary)",
                  fontFamily: "var(--font-mono), monospace",
                }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mb-4 h-px w-8"
                style={{
                  background: i < currentStep ? "var(--accent)" : "var(--border-default)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
