"use client";

import { useFormStatus } from "react-dom";

// Reads the pending state of the nearest enclosing <form> — works with plain
// server actions with no extra client state. Shows a small spinner next to
// the label so a slow action (a large KMZ bulk-assign, a rate-card upload)
// visibly registers as "working" instead of looking like nothing happened.
export function SubmitButton({
  children,
  pendingText,
  className,
  formAction,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} disabled={pending} className={`${className ?? ""} disabled:opacity-60`}>
      <span className="inline-flex items-center gap-1.5">
        {pending && (
          <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        {pending ? (pendingText ?? "Working…") : children}
      </span>
    </button>
  );
}
