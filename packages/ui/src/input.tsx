import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, id, className, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const describedById = error
    ? `${inputId}-error`
    : helper
      ? `${inputId}-helper`
      : undefined;

  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className="kt-label">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        className={cn("kt-field", "kt-input", error ? "kt-field--error" : "", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        {...rest}
      />
      {error ? (
        <span id={`${inputId}-error`} className="kt-helper kt-helper--error">
          {error}
        </span>
      ) : helper ? (
        <span id={`${inputId}-helper`} className="kt-helper">
          {helper}
        </span>
      ) : null}
    </div>
  );
});
