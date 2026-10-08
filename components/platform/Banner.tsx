export function Banner({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return error
    ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>
    : <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{ok}</div>;
}
export const field = "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm";
export const labelCls = "block text-xs font-medium text-muted uppercase tracking-wide mb-1";
