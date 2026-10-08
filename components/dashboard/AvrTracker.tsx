"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Monitor, RectangleHorizontal, Signpost, Store, Clapperboard, TrainFront, Plane, Bus, Layers, MapPin, X } from "lucide-react";
import type { IconKey, SupplierCard } from "@/lib/reports/avrCards";

const ICONS: Record<IconKey, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  monitor: Monitor, billboard: RectangleHorizontal, signpost: Signpost, store: Store, cinema: Clapperboard, rail: TrainFront, airport: Plane, bus: Bus, layers: Layers, pin: MapPin,
};
const money = (n: number) => `QAR ${Math.round(n).toLocaleString("en-US")}`;
const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`);
const pct = (f: number) => `${+(f * 100).toFixed(1)}%`;

const CHIP: Record<SupplierCard["state"], { text: (c: SupplierCard) => string; cls: string; bar: string }> = {
  "no-slabs": { text: () => "no slabs entered", cls: "bg-black/5 text-muted", bar: "bg-border" },
  below: { text: () => "below slab 1", cls: "bg-amber-50 text-amber-800", bar: "bg-amber-500" },
  mid: { text: (c) => `reached ${pct(c.bestRebatePct ?? 0)}`, cls: "bg-blue-50 text-blue-800", bar: "bg-accent" },
  top: { text: (c) => `top slab ${pct(c.bestRebatePct ?? 0)}`, cls: "bg-green-50 text-green-800", bar: "bg-green-600" },
};

export function AvrTracker({ cards, year }: { cards: SupplierCard[]; year: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const shown = onlyPending ? cards.filter((c) => c.pending !== null) : cards;
  const sel = cards.find((c) => c.supplier === open) ?? null;
  const totalPending = cards.reduce((a, c) => a + (c.pending ?? 0), 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <section className="bg-surface border border-border rounded-lg p-5 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Supplier AVR tracker — {year}</h2>
          <p className="text-xs text-muted mt-0.5">{cards.length} supplier{cards.length === 1 ? "" : "s"} · {money(totalPending)} still to spend to reach each supplier&apos;s next slab</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <label className="inline-flex items-center gap-1.5 text-muted"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />Only with something pending</label>
          <Link href="/media/settings/avr-schemes" className="text-accent underline">Manage schemes</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {shown.map((c) => {
          const chip = CHIP[c.state];
          const icons = Array.from(new Map(c.categories.map((k) => [k.icon, k.category])).entries());
          return (
            <button key={c.supplier} type="button" onClick={() => setOpen(c.supplier)} aria-label={`${c.supplier}: open details`}
              className="text-left rounded-xl border border-border bg-background p-3 hover:border-foreground/30 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground leading-tight">{c.supplier}</span>
                <span className={`shrink-0 text-[11px] rounded-full px-2 py-0.5 ${chip.cls}`}>{chip.text(c)}</span>
              </div>
              <div className="flex gap-1.5 mt-2 text-muted">
                {icons.slice(0, 5).map(([k, name]) => { const I = ICONS[k]; return <span key={k} title={name}><I size={16} strokeWidth={1.75} /></span>; })}
                {icons.length > 5 && <span className="text-[11px]">+{icons.length - 5}</span>}
              </div>
              <div className="h-1.5 rounded bg-border overflow-hidden mt-3"><div className={`h-full ${chip.bar}`} style={{ width: `${c.progressPct}%` }} /></div>
              <div className="text-xs text-muted mt-1.5 tabular-nums">{money(c.spend)} spent</div>
              <div className="text-sm font-medium text-foreground tabular-nums">
                {c.pending !== null ? `${money(c.pending)} to go` : c.state === "top" ? "Nothing pending" : "Add slabs to track"}
              </div>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted mt-2">Nothing is pending. Every supplier with slabs is at its top slab.</p>}
      <p className="text-xs text-muted mt-3">Spend is the supplier&apos;s total for the year. It is not split by category yet, because bookings are not tagged to an AVR category.</p>

      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${sel.supplier} AVR details`}>
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(null)} />
          <aside className="relative w-full max-w-md h-full bg-surface border-l border-border shadow-xl overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-lg font-medium text-foreground">{sel.supplier}</h3><p className="text-xs text-muted mt-0.5">{year} · {money(sel.spend)} spent</p></div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-black/5"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-lg bg-background p-3"><div className="text-xs text-muted">Pending to next slab</div><div className="text-sm font-medium tabular-nums">{sel.pending !== null ? money(sel.pending) : "Nothing"}</div>{sel.pendingCategory && <div className="text-[11px] text-muted">{sel.pendingCategory} to {pct(sel.pendingRebatePct ?? 0)}</div>}</div>
              <div className="rounded-lg bg-background p-3"><div className="text-xs text-muted">Estimated rebate so far</div><div className="text-sm font-medium tabular-nums">{money(sel.estimatedRebate)}</div><div className="text-[11px] text-muted">spend x slab reached</div></div>
            </div>
            <div className="mt-5 space-y-4">
              {sel.categories.map((k) => {
                const I = ICONS[k.icon];
                return (
                  <div key={k.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2"><span className="text-muted"><I size={18} strokeWidth={1.75} /></span><span className="text-sm font-medium text-foreground">{k.category}</span>
                      <span className={`ml-auto text-[11px] rounded-full px-2 py-0.5 ${k.state === "top" ? "bg-green-50 text-green-800" : k.state === "mid" ? "bg-blue-50 text-blue-800" : k.state === "below" ? "bg-amber-50 text-amber-800" : "bg-black/5 text-muted"}`}>
                        {k.state === "no-slabs" ? "no slabs entered" : k.state === "below" ? "below slab 1" : k.state === "top" ? `top slab ${pct(k.currentRebatePct!)}` : `reached ${pct(k.currentRebatePct!)}`}</span></div>
                    {k.slabs.length > 0 && (
                      <table className="w-full text-xs mt-2"><thead><tr className="text-left text-muted"><th className="font-medium py-1">From spend</th><th className="font-medium py-1">Rebate</th><th className="font-medium py-1 text-right">Status</th></tr></thead>
                        <tbody>{k.slabs.map((s) => <tr key={s.thresholdFrom} className="border-t border-border"><td className="py-1 tabular-nums">{money(s.thresholdFrom)}</td><td className="py-1 tabular-nums">{pct(s.rebatePct)}</td><td className="py-1 text-right text-muted">{s.reached ? "reached" : `${short(s.thresholdFrom - sel.spend)} to go`}</td></tr>)}</tbody></table>
                    )}
                  </div>
                );
              })}
            </div>
            <Link href="/media/settings/avr-schemes" className="inline-block mt-5 text-sm text-accent underline">Edit this supplier&apos;s schemes</Link>
          </aside>
        </div>
      )}
    </section>
  );
}
