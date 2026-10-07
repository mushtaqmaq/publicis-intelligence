// Online (digital) plan block: objective sections with platform rows, budget allocation or manual spend,
// KPI estimates and calendar weeks. A port of the Publicis Media Qatar planner's online calculations;
// the block is stored on the plan version (media_plan_versions.onlineData) so it versions and locks with the plan.

export type OnlineRow = {
  id: string; platform: string; format: string; placement: string; specs: string;
  unit: string; price: number | string; objective: string; alloc: number | string; qar: number | string; weeks: string[];
};
export type OnlineSection = { id: string; name: string; kpi: string; mode: "allocation" | "manual"; total: number | string; rows: OnlineRow[] };
export type Targeting = { platform: string; demographics: string; geographics: string; interests: string };
export type OnlineData = { fx: number | string; sections: OnlineSection[]; targeting: Targeting[]; terms?: string };

export const UNITS = ["CPM", "vCPM", "CPV", "CPCV", "CPC", "CPLP", "CPE", "CPL", "CPA", "CPI", "Flat"] as const;
export const KPIS = ["Impressions", "Reach", "Video Views", "Completed Views", "Clicks", "Landing Page Views", "Engagements", "Leads", "Conversions", "Installs"] as const;
export const SECTION_PRESETS: [string, string][] = [["Awareness", "Impressions"], ["Video views", "Video Views"], ["Traffic", "Clicks"], ["Engagement", "Engagements"], ["Leads", "Leads"], ["Conversions", "Conversions"]];
export const DEFAULT_FX = 3.65; // QAR per USD

/** Lenient number parse used across the plan: strips symbols, never returns NaN. */
export const n = (v: unknown): number => {
  const x = +String(v ?? "").replace(/[^0-9.\-]/g, "");
  return Number.isFinite(x) ? x : 0;
};

const uid = () => Math.random().toString(36).slice(2, 10);
export const newOnlineRow = (): OnlineRow => ({ id: uid(), platform: "", format: "", placement: "", specs: "", unit: "CPM", price: 0, objective: "", alloc: 0, qar: 0, weeks: [] });
export const newOnlineData = (): OnlineData => ({
  fx: DEFAULT_FX,
  sections: [{ id: uid(), name: "Awareness", kpi: "Impressions", mode: "allocation", total: 0, rows: [newOnlineRow()] }],
  targeting: [{ platform: "", demographics: "", geographics: "Qatar", interests: "" }],
});

const iso = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Inclusive campaign length in days (0 if the range is invalid). */
export function campaignDays(start: Date | string, end: Date | string): number {
  const d = Math.round((new Date(iso(end)).getTime() - new Date(iso(start)).getTime()) / 864e5) + 1;
  return d > 0 ? d : 0;
}

/** Calendar weeks across the campaign, labelled W1, W2 ... within each month. */
export function weeksOf(start: Date | string, end: Date | string): { month: string; label: string; date: string }[] {
  const s = new Date(iso(start) + "T00:00:00Z"), e = new Date(iso(end) + "T00:00:00Z");
  if (!(s <= e)) return [];
  const out: { month: string; label: string; date: string }[] = [];
  const seen: Record<string, number> = {};
  for (let d = new Date(s); d <= e && out.length < 60; d = new Date(d.getTime() + 7 * 864e5)) {
    const m = d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" }) + " " + d.getUTCFullYear();
    seen[m] = (seen[m] || 0) + 1;
    out.push({ month: m, label: "W" + seen[m], date: d.toISOString().slice(0, 10) });
  }
  return out;
}

export type OnlineSectionCalc = {
  rows: { qar: number; usd: number; kpi: number; dQar: number; dUsd: number }[];
  qar: number; usd: number; kpi: number; alloc: number; avgPrice: number; dQar: number;
};

/** Per-section spend (QAR/USD), estimated KPI results and daily spend. */
export function calcOnline(data: OnlineData, start: Date | string, end: Date | string): OnlineSectionCalc[] {
  const fx = n(data.fx) || DEFAULT_FX;
  const D = campaignDays(start, end) || 1;
  return data.sections.map((sec) => {
    const rows = sec.rows.map((r) => {
      const qar = sec.mode === "allocation" ? n(sec.total) * n(r.alloc) : n(r.qar);
      const usd = qar / fx;
      const price = n(r.price);
      const kpi = r.unit === "Flat" || !price ? 0 : /CPM$/.test(r.unit) ? (usd / price) * 1000 : usd / price;
      return { qar, usd, kpi, dQar: qar / D, dUsd: usd / D };
    });
    const tq = rows.reduce((a, r) => a + r.qar, 0);
    return {
      rows, qar: tq, usd: tq / fx,
      kpi: rows.reduce((a, r) => a + r.kpi, 0),
      alloc: sec.rows.reduce((a, r) => a + n(r.alloc), 0),
      avgPrice: sec.rows.length ? sec.rows.reduce((a, r) => a + n(r.price), 0) / sec.rows.length : 0,
      dQar: tq / D,
    };
  });
}

export const onlineTotalQar = (data: OnlineData, start: Date | string, end: Date | string) =>
  calcOnline(data, start, end).reduce((a, s) => a + s.qar, 0);

/** Validates untrusted JSON before it is stored: shape, sizes, and numbers kept as plain numbers/strings. */
export function sanitizeOnlineData(input: unknown): OnlineData {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
  const sections = (Array.isArray(o.sections) ? o.sections : []).slice(0, 20).map((s) => {
    const sec = (s ?? {}) as Record<string, unknown>;
    const rows = (Array.isArray(sec.rows) ? sec.rows : []).slice(0, 200).map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        id: str(row.id, 40) || uid(), platform: str(row.platform), format: str(row.format), placement: str(row.placement), specs: str(row.specs, 500),
        unit: (UNITS as readonly string[]).includes(String(row.unit)) ? String(row.unit) : "CPM",
        price: n(row.price), objective: str(row.objective), alloc: n(row.alloc), qar: n(row.qar),
        weeks: (Array.isArray(row.weeks) ? row.weeks : []).slice(0, 60).map((w) => str(w, 12)),
      } satisfies OnlineRow;
    });
    return { id: str(sec.id, 40) || uid(), name: str(sec.name, 120), kpi: str(sec.kpi, 60), mode: sec.mode === "manual" ? "manual" : "allocation", total: n(sec.total), rows } satisfies OnlineSection;
  });
  const targeting = (Array.isArray(o.targeting) ? o.targeting : []).slice(0, 50).map((t) => {
    const x = (t ?? {}) as Record<string, unknown>;
    return { platform: str(x.platform), demographics: str(x.demographics, 500), geographics: str(x.geographics, 500), interests: str(x.interests, 500) };
  });
  return { fx: n(o.fx) || DEFAULT_FX, sections, targeting, terms: o.terms == null ? undefined : str(o.terms, 8000) };
}
