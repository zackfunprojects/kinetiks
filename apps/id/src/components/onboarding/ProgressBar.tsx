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
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCompleted
                    ? "bg-[#6C5CE7] text-white"
                    : isCurrent
                      ? "border-2 border-[#6C5CE7] bg-[#f0eeff] text-[#6C5CE7]"
                      : "border border-gray-200 bg-white text-gray-400"
                }`}
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
                className={`text-[10px] font-medium ${
                  isCompleted || isCurrent ? "text-[#6C5CE7]" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mb-4 h-px w-8 ${
                  i < currentStep ? "bg-[#6C5CE7]" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
