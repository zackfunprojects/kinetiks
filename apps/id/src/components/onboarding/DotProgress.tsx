interface DotProgressProps {
  currentStep: number;
  totalSteps: number;
}

export function DotProgress({ currentStep, totalSteps }: DotProgressProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {Array.from({ length: totalSteps }, (_, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;

        return (
          <div
            key={i}
            className="rounded-full transition-all"
            style={{
              width: isCurrent ? 24 : 8,
              height: 8,
              background: isCompleted || isCurrent
                ? "var(--accent-emphasis)"
                : "var(--border-default)",
              opacity: isCompleted ? 0.5 : 1,
              borderRadius: 999,
            }}
          />
        );
      })}
    </div>
  );
}
