import { forwardRef, useId, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helper, error, id, className, ...rest },
  ref,
) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const describedById = error
    ? `${fieldId}-error`
    : helper
      ? `${fieldId}-helper`
      : undefined;

  return (
    <div>
      {label ? (
        <label htmlFor={fieldId} className="kt-label">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={fieldId}
        className={cn("kt-field", "kt-textarea", error ? "kt-field--error" : "", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        {...rest}
      />
      {error ? (
        <span id={`${fieldId}-error`} className="kt-helper kt-helper--error">
          {error}
        </span>
      ) : helper ? (
        <span id={`${fieldId}-helper`} className="kt-helper">
          {helper}
        </span>
      ) : null}
    </div>
  );
});
