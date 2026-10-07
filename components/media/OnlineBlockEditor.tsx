"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOnlineBlockAction } from "@/app/media/plans/[planId]/onlineActions";
import {
  UNITS, KPIS, SECTION_PRESETS, DEFAULT_FX, calcOnline, weeksOf, n, newOnlineRow,
  type OnlineData, type OnlineRow, type OnlineSection,
} from "@/lib/planning/online";
import { readAiStream, extractJson, onlineDraftFromAi, draftSystemPrompt } from "@/lib/planning/onlineDraft";

const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const uid = () => Math.random().toString(36).slice(2, 10);
const inp = "w-full rounded border border-border bg-surface px-2 py-1 text-sm disabled:bg-black/5 disabled:text-muted";

export type DraftContext = { client?: string; brand?: string | null; objective?: string | null; audience?: string | null; locations?: string | null; budget?: number | null };

export function OnlineBlockEditor({ planId, versionId, locked, initial, start, end, ctx }: {
  planId: string; versionId: string; locked: boolean; initial: OnlineData; start: string; end: string; ctx?: DraftContext;
}) {
  const [data, setData] = useState<OnlineData>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftOpen, setDraftOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [draftBudget, setDraftBudget] = useState(ctx?.budget ? String(ctx.budget) : "");
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);
  const calc = useMemo(() => calcOnline(data, start, end), [data, start, end]);
  const weeks = useMemo(() => weeksOf(start, end), [start, end]);
  const total = calc.reduce((a, s) => a + s.qar, 0);

  const edit = (fn: (d: OnlineData) => void) => { setData((d) => { const c = structuredClone(d); fn(c); return c; }); setDirty(true); setMsg(null); };
  const setRow = (si: number, ri: number, patch: Partial<OnlineRow>) => edit((d) => { Object.assign(d.sections[si].rows[ri], patch); });
  const setSec = (si: number, patch: Partial<OnlineSection>) => edit((d) => { Object.assign(d.sections[si], patch); });

  // Asks the AI for an online draft (module-checked route media/plan). The result replaces the block and stays
  // fully editable; nothing is saved until you press Save.
  async function draft() {
    if (!brief.trim()) { setDraftErr("Describe the objective first."); return; }
    const hasWork = data.sections.some((sec) => sec.rows.some((r) => r.platform || n(r.price) || n(r.alloc)));
    if (hasWork && !window.confirm("This replaces the online plan you have so far (until you save). Continue?")) return;
    setDrafting(true); setDraftErr(null);
    try {
      const budget = n(draftBudget);
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "content-type": "application/json", "x-pi": "1" },
        body: JSON.stringify({
          route: "media/plan", tier: "complex", json: true,
          system: draftSystemPrompt({ client: ctx?.client, brand: ctx?.brand, objective: ctx?.objective, audience: ctx?.audience, locations: ctx?.locations }),
          messages: [{ role: "user", content: `Brief: ${brief.trim()}\nCampaign dates: ${start} to ${end}\nOnline budget QAR: ${budget || "decide sensibly"}` }],
        }),
      });
      const raw = await res.text();
      if (!res.ok) { let m = `Request failed (${res.status})`; try { m = JSON.parse(raw).error || m; } catch { /* keep default */ } throw new Error(m); }
      const out = readAiStream(raw);
      if (out.error) throw new Error(out.error);
      const block = onlineDraftFromAi(extractJson(out.text), start, end, n(data.fx) || DEFAULT_FX);
      if (!block) throw new Error("The AI did not return any platforms. Try again with more detail.");
      setData({ ...block, terms: data.terms }); setDirty(true);
      setMsg({ ok: true, text: "Draft ready. Prices are AI estimates: review and confirm every one against current rate cards, then Save." });
      setDraftOpen(false);
    } catch (e) { setDraftErr(e instanceof Error ? e.message : "The draft failed."); }
    finally { setDrafting(false); }
  }

  function save() {
    startTransition(async () => {
      const r = await saveOnlineBlockAction(planId, versionId, data);
      if (r.ok) { setDirty(false); setMsg({ ok: true, text: "Saved" }); } else setMsg({ ok: false, text: r.error });
    });
  }

  return (
    <section className="bg-surface border border-border rounded-lg p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Online plan</h2>
          <p className="text-xs text-muted mt-0.5">Budget by objective and platform, estimated results, and weekly flighting. Saved with this plan version.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-xs text-muted">QAR per USD
            <input className={inp + " !w-20"} disabled={locked} value={String(data.fx)} inputMode="decimal" onChange={(e) => edit((d) => { d.fx = e.target.value; })} />
          </label>
          <div className="text-right"><div className="text-xs text-muted">Online spend</div><div className="font-semibold">QAR {fmt(total)}</div></div>
          {!locked && <button onClick={() => { setDraftOpen((v) => !v); setDraftErr(null); }} className="rounded-lg border border-border px-3 py-1.5 text-sm text-accent">Draft with AI</button>}
          {!locked && <button onClick={save} disabled={pending || !dirty} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-40">{pending ? "Saving…" : "Save"}</button>}
        </div>
      </div>
      {draftOpen && !locked && (
        <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
          <label className="block text-xs font-medium text-muted">Objective and brief
            <textarea className={inp + " mt-1 min-h-[80px]"} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Drive applications for the new travel card among affluent Qatari nationals and expats, 25 to 45." />
          </label>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted">Online budget (QAR)
              <input className={inp + " mt-1 !w-36"} inputMode="decimal" value={draftBudget} onChange={(e) => setDraftBudget(e.target.value)} placeholder="e.g. 150000" />
            </label>
            <button onClick={draft} disabled={drafting} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground disabled:opacity-50">{drafting ? "Planning… this can take a minute" : "Draft plan"}</button>
            <button onClick={() => setDraftOpen(false)} className="text-xs text-muted">Cancel</button>
          </div>
          <p className="mt-2 text-xs text-muted">Proposes platforms, units, prices and budget shares for Qatar. Every number stays editable. Prices are estimates, not quoted rates. Uses credits.</p>
          {draftErr && <p className="mt-2 text-xs text-[var(--danger)]">{draftErr}</p>}
        </div>
      )}
      {msg && <div className={`mb-3 rounded border px-3 py-2 text-xs ${msg.ok ? "border-green-200 bg-green-50 text-[var(--success)]" : "border-red-200 bg-red-50 text-[var(--danger)]"}`}>{msg.text}</div>}
      {locked && <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-[var(--warning)]">This version is locked. Create a new version to edit the online plan.</div>}

      {data.sections.map((sec, si) => {
        const c = calc[si];
        const allocOff = sec.mode === "allocation" && Math.abs(c.alloc - 1) > 0.0001;
        return (
          <div key={sec.id} className="mb-5 rounded-lg border border-border">
            <div className="flex flex-wrap items-end gap-3 border-b border-border bg-background/60 p-3">
              <label className="text-xs text-muted">Objective
                <input className={inp + " mt-0.5 !w-44"} disabled={locked} value={sec.name} onChange={(e) => setSec(si, { name: e.target.value })} />
              </label>
              <label className="text-xs text-muted">Result measured
                <select className={inp + " mt-0.5"} disabled={locked} value={sec.kpi} onChange={(e) => setSec(si, { kpi: e.target.value })}>
                  {[...new Set([...KPIS, sec.kpi])].map((k) => <option key={k}>{k}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted">Budget by
                <select className={inp + " mt-0.5"} disabled={locked} value={sec.mode} onChange={(e) => setSec(si, { mode: e.target.value as OnlineSection["mode"] })}>
                  <option value="allocation">Share of objective budget</option><option value="manual">Spend per row</option>
                </select>
              </label>
              {sec.mode === "allocation" && (
                <label className="text-xs text-muted">Objective budget (QAR)
                  <input className={inp + " mt-0.5 !w-32"} disabled={locked} inputMode="decimal" value={String(sec.total)} onChange={(e) => setSec(si, { total: e.target.value })} />
                </label>
              )}
              <div className="ml-auto text-right text-xs"><div className="text-muted">Section</div><div className="font-semibold">QAR {fmt(c.qar)} · {fmt(c.kpi)} {sec.kpi.toLowerCase()}</div></div>
              {!locked && <button className="text-xs text-[var(--danger)]" onClick={() => edit((d) => { d.sections.splice(si, 1); })}>Remove objective</button>}
            </div>
            {allocOff && <div className="px-3 pt-2 text-xs text-[var(--warning)]">Shares add up to {fmt(c.alloc * 100, 1)}%, not 100%.</div>}
            <div className="overflow-x-auto p-3">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted">
                  <th className="pr-2">Platform</th><th className="pr-2">Format</th><th className="pr-2">Placement</th><th className="pr-2">Buy</th><th className="pr-2">Price (USD)</th>
                  <th className="pr-2">{sec.mode === "allocation" ? "Share %" : "Spend (QAR)"}</th><th className="pr-2 text-right">QAR</th><th className="pr-2 text-right">USD</th><th className="pr-2 text-right">Est. {sec.kpi}</th><th />
                </tr></thead>
                <tbody>
                  {sec.rows.map((r, ri) => (
                    <tr key={r.id} className="align-top">
                      <td className="pr-2 pb-1"><input className={inp} disabled={locked} value={r.platform} onChange={(e) => setRow(si, ri, { platform: e.target.value })} /></td>
                      <td className="pr-2 pb-1"><input className={inp} disabled={locked} value={r.format} onChange={(e) => setRow(si, ri, { format: e.target.value })} /></td>
                      <td className="pr-2 pb-1"><input className={inp} disabled={locked} value={r.placement} onChange={(e) => setRow(si, ri, { placement: e.target.value })} /></td>
                      <td className="pr-2 pb-1"><select className={inp} disabled={locked} value={r.unit} onChange={(e) => setRow(si, ri, { unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
                      <td className="pr-2 pb-1"><input className={inp + " !w-20"} disabled={locked} inputMode="decimal" value={String(r.price)} onChange={(e) => setRow(si, ri, { price: e.target.value })} /></td>
                      <td className="pr-2 pb-1">
                        {sec.mode === "allocation"
                          ? <input className={inp + " !w-20"} disabled={locked} inputMode="decimal" value={String(+(n(r.alloc) * 100).toFixed(2))} onChange={(e) => setRow(si, ri, { alloc: n(e.target.value) / 100 })} />
                          : <input className={inp + " !w-28"} disabled={locked} inputMode="decimal" value={String(r.qar)} onChange={(e) => setRow(si, ri, { qar: e.target.value })} />}
                      </td>
                      <td className="pr-2 pt-1.5 text-right tabular-nums">{fmt(c.rows[ri].qar)}</td>
                      <td className="pr-2 pt-1.5 text-right tabular-nums">{fmt(c.rows[ri].usd)}</td>
                      <td className="pr-2 pt-1.5 text-right tabular-nums">{r.unit === "Flat" || !n(r.price) ? "–" : fmt(c.rows[ri].kpi)}</td>
                      <td className="pb-1">{!locked && <button className="text-[var(--danger)]" title="Remove row" onClick={() => edit((d) => { d.sections[si].rows.splice(ri, 1); })}>✕</button>}</td>
                    </tr>
                  ))}
                  {sec.rows.length > 0 && weeks.length > 0 && (
                    <tr><td colSpan={10} className="pt-2">
                      <details><summary className="cursor-pointer text-muted">Weekly flighting</summary>
                        <div className="mt-2 space-y-1.5">
                          {sec.rows.map((r, ri) => (
                            <div key={r.id} className="flex flex-wrap items-center gap-1">
                              <span className="w-28 shrink-0 truncate text-muted">{r.platform || "Row " + (ri + 1)}</span>
                              {weeks.map((w) => {
                                const on = r.weeks.includes(w.date);
                                return <button key={w.date} disabled={locked} title={`${w.month} ${w.label} (${w.date})`}
                                  className={`rounded px-1.5 py-0.5 text-[11px] ${on ? "bg-accent text-accent-foreground" : "bg-black/5 text-muted"}`}
                                  onClick={() => setRow(si, ri, { weeks: on ? r.weeks.filter((x) => x !== w.date) : [...r.weeks, w.date] })}>{w.label}</button>;
                              })}
                            </div>
                          ))}
                        </div>
                      </details>
                    </td></tr>
                  )}
                </tbody>
              </table>
              {!locked && <button className="mt-2 text-xs text-accent" onClick={() => edit((d) => { d.sections[si].rows.push(newOnlineRow()); })}>+ Add platform row</button>}
            </div>
          </div>
        );
      })}

      {!locked && (
        <div className="mb-5 flex flex-wrap gap-2">
          {SECTION_PRESETS.map(([name, kpi]) => (
            <button key={name} className="rounded border border-border px-2 py-1 text-xs text-accent" onClick={() => edit((d) => { d.sections.push({ id: uid(), name, kpi, mode: "allocation", total: 0, rows: [newOnlineRow()] }); })}>+ {name}</button>
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Targeting</h3>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="pr-2">Platform</th><th className="pr-2">Demographics</th><th className="pr-2">Geographics</th><th className="pr-2">Interests</th><th /></tr></thead>
          <tbody>
            {data.targeting.map((t, ti) => (
              <tr key={ti}>
                {(["platform", "demographics", "geographics", "interests"] as const).map((k) => (
                  <td key={k} className="pr-2 pb-1"><input className={inp} disabled={locked} value={t[k]} onChange={(e) => edit((d) => { d.targeting[ti][k] = e.target.value; })} /></td>
                ))}
                <td>{!locked && <button className="text-[var(--danger)]" onClick={() => edit((d) => { d.targeting.splice(ti, 1); })}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!locked && <button className="mt-1 text-xs text-accent" onClick={() => edit((d) => { d.targeting.push({ platform: "", demographics: "", geographics: "Qatar", interests: "" }); })}>+ Add targeting row</button>}
      </div>
    </section>
  );
}
