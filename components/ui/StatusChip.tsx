const TONE_CLASSES = {
  success: "bg-[#eef4ee] text-[var(--success)] border-[#cfe3cf]",
  neutral: "bg-background text-muted border-border",
  warning: "bg-[#faf1e8] text-[var(--warning)] border-[#f0dcc4]",
  danger: "bg-[#f8ecea] text-[var(--danger)] border-[#eccbc4]",
} as const;

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: keyof typeof TONE_CLASSES }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${TONE_CLASSES[tone]}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          tone === "success" ? "bg-[var(--success)]" : tone === "warning" ? "bg-[var(--warning)]" : tone === "danger" ? "bg-[var(--danger)]" : "bg-muted"
        }`}
      />
      {label}
    </span>
  );
}
