import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASSES = {
  primary: "bg-accent text-accent-foreground hover:brightness-95",
  secondary: "bg-surface text-foreground border border-border hover:bg-background",
  ghost: "text-foreground hover:bg-background",
  danger: "bg-surface text-[var(--danger)] border border-red-200 hover:bg-red-50",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT_CLASSES }) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
