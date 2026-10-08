"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSuggestionCatalogueAction, priceSuggestionAction, addSuggestionsAction, type PricedRow } from "@/app/media/plans/[planId]/suggestActions";
import { suggestionPrompt, readPicks } from "@/lib/planning/suggestPure";
import { readAiStream, extractJson } from "@/lib/planning/onlineDraft";

const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const inp = "w-full rounded border border-border bg-surface px-2 py-1 text-sm";
type Sup = { id: string; name: string; mediaChannel: string };

export function InventorySuggest({ planId, versionId, suppliers, channels, defaultBudget }: {
  planId: string; versionId: string; suppliers: Sup[]; channels: readonly string[]; defaultBudget: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState(""); const [supplierId, setSupplierId] = useState(""); const [q, setQ] = useState("");
  const [brief, setBrief] = useState(""); const [budget, setBudget] = useState(defaultBudget ? String(defaultBudget) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rows, setRows] = useState<PricedRow[]>([]);
  const [dropped, setDropped] = useState<{ assetId: string; reason: string }[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});

  const budgetN = Number(String(budget).replace(/[^0-9.]/g, "")) || 0;
  const chosen = rows.filter((r) => sel[r.assetId]);
  const chosenTotal = chosen.reduce((a, r) => a + (r.total ?? 0), 0);

  async function run() {
    if (!brief.trim()) { setErr("Describe what the campaign needs first."); return; }
    setErr(null); setRows([]); setDropped([]); setInfo(null);
    try {
      setBusy("Looking through the inventory…");
      const cat = await getSuggestionCatalogueAction(planId, versionId, { channel, supplierId, q });
      if (!cat.ok) throw new Error(cat.error);
      setInfo(`Considered ${cat.candidates.length} inventory items with published rates${cat.noRate ? ` (${cat.noRate} skipped: no published rate for this period)` : ""}.`);
      const p = suggestionPrompt({ campaign: { start: cat.start, end: cat.end }, brief, budget: budgetN || cat.budget, client: cat.client, candidates: cat.candidates });
      if (!p.pricedCount) throw new Error("None of the matching inventory has a confirmed price for this period. Try other filters.");
      setBusy("Choosing a plan…");
      const res = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json", "x-pi": "1" }, body: JSON.stringify({ route: "media/plan", tier: "complex", json: true, system: p.system, messages: [{ role: "user", content: p.user }] }) });
      const raw = await res.text();
      if (!res.ok) { let m = `Request failed (${res.status})`; try { m = JSON.parse(raw).error || m; } catch { /* default */ } throw new Error(m); }
      const out = readAiStream(raw); if (out.error) throw new Error(out.error);
      const picks = readPicks(extractJson(out.text));
      if (!picks.length) throw new Error("The AI did not choose any assets. Try again with more detail.");
      setBusy("Pricing with the planner's rates…");
      const priced = await priceSuggestionAction(planId, versionId, picks);
      if (!priced.ok) throw new Error(priced.error);
      if (!priced.rows.length) throw new Error("None of the AI's picks could be used. Try again.");
      setRows(priced.rows); setDropped(priced.dropped); setSel(Object.fromEntries(priced.rows.map((r) => [r.assetId, true])));
    } catch (e) { setErr(e instanceof Error ? e.message : "The suggestion failed."); }
    finally { setBusy(null); }
  }

  async function reprice() {
    setErr(null); setBusy("Re-pricing…");
    try {
      const priced = await priceSuggestionAction(planId, versionId, rows.map((r) => ({ assetId: r.assetId, qty: r.qty, why: r.why })));
      if (!priced.ok) throw new Error(priced.error);
      setRows(priced.rows);
    } catch (e) { setErr(e instanceof Error ? e.message : "Re-pricing failed."); } finally { setBusy(null); }
  }

  async function add() {
    setErr(null); setBusy("Adding to the plan…");
    try {
      const r = await addSuggestionsAction(planId, versionId, chosen.map((c) => ({ assetId: c.assetId, qty: c.qty })));
      if (!r.ok) throw new Error(r.error);
      setRows([]); setOpen(false); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Adding failed."); } finally { setBusy(null); }
  }

  return (
    <section className="bg-surface border border-border rounded-lg p-5 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Suggest from inventory</h2>
          <p className="text-xs text-muted mt-0.5">The AI chooses from your real inventory at real rates. It never invents a price; you review every line before it is added.</p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-accent">{open ? "Close" : "Suggest lines"}</button>
      </div>

      {open && (
        <div className="mt-4">
          <label className="block text-xs font-medium text-muted">What does the campaign need?
            <textarea className={inp + " mt-1 min-h-[70px]"} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. High-visibility coverage of Doha commuters for a bank launch, a mix of big formats and street furniture." />
          </label>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted">Medium
              <select className={inp + " mt-1"} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Any</option>{channels.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="text-xs text-muted">Supplier
              <select className={inp + " mt-1 !w-48"} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Any</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
            <label className="text-xs text-muted">Area or keyword
              <input className={inp + " mt-1 !w-40"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Corniche" />
            </label>
            <label className="text-xs text-muted">Budget (QAR)
              <input className={inp + " mt-1 !w-32"} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <button onClick={run} disabled={!!busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-50">{busy ?? "Suggest"}</button>
          </div>
          <p className="mt-2 text-xs text-muted">Uses credits. Prices come from the published rate cards (never a future rate year); anything marked TBD or POA is left out and never counted as zero.</p>
          {info && <p className="mt-2 text-xs text-muted">{info}</p>}
          {err && <p className="mt-2 text-xs text-[var(--danger)]">{err}</p>}

          {rows.length > 0 && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted"><th /><th className="pr-2">Asset</th><th className="pr-2">Rate period</th><th className="pr-2">Qty</th><th className="pr-2 text-right">Gross</th><th className="pr-2 text-right">Net media</th><th className="pr-2 text-right">Fees</th><th className="pr-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.assetId} className="border-t border-border align-top">
                        <td className="py-1.5 pr-2"><input type="checkbox" checked={!!sel[r.assetId]} onChange={(e) => setSel({ ...sel, [r.assetId]: e.target.checked })} /></td>
                        <td className="py-1.5 pr-2"><div className="font-medium text-foreground">{r.assetName}</div><div className="text-muted">{r.supplier}{r.area ? ` · ${r.area}` : ""}</div>{r.why && <div className="mt-0.5 italic text-muted">{r.why}</div>}</td>
                        <td className="py-1.5 pr-2">{r.period}</td>
                        <td className="py-1.5 pr-2"><input className={inp + " !w-16"} type="number" min={1} max={r.maxQty} value={r.qty} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} /><div className="text-[10px] text-muted">max {r.maxQty}</div></td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{r.gross === null ? "TBD" : fmt(r.gross)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{r.net === null ? "TBD" : fmt(r.net)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.fees)}</td>
                        <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{r.total === null ? "TBD" : fmt(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">Selected: <b>QAR {fmt(chosenTotal)}</b>{budgetN > 0 && <span className={chosenTotal > budgetN ? "ml-2 text-[var(--danger)]" : "ml-2 text-muted"}>{chosenTotal > budgetN ? `over budget by QAR ${fmt(chosenTotal - budgetN)}` : `QAR ${fmt(budgetN - chosenTotal)} under budget`}</span>}</div>
                <div className="flex gap-2">
                  <button onClick={reprice} disabled={!!busy} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50">Re-price quantities</button>
                  <button onClick={add} disabled={!!busy || chosen.length === 0} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-50">Add {chosen.length} line{chosen.length === 1 ? "" : "s"} to plan</button>
                </div>
              </div>
              {dropped.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted">{dropped.map((d, i) => <li key={i}>{d.reason}</li>)}</ul>}
              <p className="mt-2 text-xs text-muted">Lines are added at the full campaign period with no discount. Open any line afterwards to adjust, or remove it.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
