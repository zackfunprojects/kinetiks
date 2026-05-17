import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  ariaLabel: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { pressed, onPressedChange, ariaLabel, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-pressed={pressed}
      aria-checked={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn("kt-toggle", className)}
      onClick={() => onPressedChange(!pressed)}
      {...rest}
    />
  );
});
