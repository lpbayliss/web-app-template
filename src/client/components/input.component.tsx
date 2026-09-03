import { type InputHTMLAttributes, useId } from "react";
import { tv } from "tailwind-variants";

const inputStyles = tv({
  base: "h-10 w-full rounded-md border bg-surface-raised px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
  variants: {
    invalid: { true: "border-danger", false: "border-line" },
  },
});

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
}

/** Labelled input with accessible error wiring (aria-invalid + aria-describedby). */
export function Input({ label, error, id, className, ...rest }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        className={inputStyles({ invalid: Boolean(error), className })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
