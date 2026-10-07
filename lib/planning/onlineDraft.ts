// AI draft for the online block: the model proposes objectives, platforms, units, prices and budget shares.
// Everything it returns is an ESTIMATE the planner must review; this module only validates and shapes it.
// (Offline/OOH lines are never drafted by AI: they come from real inventory with real rates.)
import { KPIS, UNITS, weeksOf, n, type OnlineData } from "./online";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Strips the streaming control markers /api/ai adds (status lines, META footer) and surfaces errors. */
export function readAiStream(raw: string): { text: string; error?: string } {
  const errAt = raw.indexOf("\u0000ERR:");
  if (errAt >= 0) return { text: "", error: raw.slice(errAt + 5).trim() || "The AI provider returned an error." };
  const metaAt = raw.indexOf("\u0000META:");
  const body = (metaAt >= 0 ? raw.slice(0, metaAt) : raw).replace(/\u0001(STATUS|DATA):[^\n]*\n?/g, "");
  return { text: body.trim() };
}

/** Pulls the first JSON object out of model text (tolerates code fences and prose around it). */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  if (start < 0) throw new Error("The AI did not return a plan. Try again with a clearer brief.");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { break; } }
  }
  throw new Error("The AI plan could not be read. Try again.");
}

const s = (v: unknown, max = 300) => String(v ?? "").slice(0, max);

/** Turns the model's JSON into an online block. Returns null when there is nothing usable. */
export function onlineDraftFromAi(json: unknown, start: string, end: string, fx = 3.65): OnlineData | null {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const allWeeks = weeksOf(start, end).map((w) => w.date);
  const sections = (Array.isArray(o.sections) ? o.sections : []).slice(0, 12).map((raw) => {
    const sec = (raw ?? {}) as Record<string, unknown>;
    let rows = (Array.isArray(sec.rows) ? sec.rows : []).slice(0, 40).map((r) => {
      const x = (r ?? {}) as Record<string, unknown>;
      return {
        id: uid(), platform: s(x.platform), format: s(x.format), placement: s(x.placement), specs: s(x.specs, 500),
        unit: (UNITS as readonly string[]).includes(String(x.unit)) ? String(x.unit) : "CPM",
        price: Math.max(0, n(x.price)), objective: s(x.objective), alloc: Math.max(0, n(x.alloc)), qar: 0, weeks: allWeeks.slice(),
      };
    });
    // Budget shares must add up to 100%: scale a near-miss, spread evenly when none were given.
    const sum = rows.reduce((a, r) => a + r.alloc, 0);
    if (rows.length) rows = rows.map((r) => ({ ...r, alloc: sum > 0 ? r.alloc / sum : 1 / rows.length }));
    return {
      id: uid(), name: s(sec.name, 120) || "Section",
      kpi: (KPIS as readonly string[]).includes(String(sec.kpi)) ? String(sec.kpi) : "Impressions",
      mode: "allocation" as const, total: Math.max(0, n(sec.total)), rows,
    };
  }).filter((sec) => sec.rows.length > 0);
  if (!sections.length) return null;
  const targeting = (Array.isArray(o.targeting) ? o.targeting : []).slice(0, 30).map((t) => {
    const x = (t ?? {}) as Record<string, unknown>;
    return { platform: s(x.platform), demographics: s(x.demographics, 500), geographics: s(x.geographics, 500), interests: s(x.interests, 500) };
  });
  return { fx, sections, targeting: targeting.length ? targeting : [{ platform: "", demographics: "", geographics: "Qatar", interests: "" }] };
}

export function draftSystemPrompt(ctx: { client?: string; brand?: string | null; objective?: string | null; audience?: string | null; locations?: string | null }): string {
  const example = {
    sections: [{ name: "Awareness", kpi: "Impressions", total: 50000, rows: [{ platform: "Instagram", format: "Static + video", placement: "Feed, Stories, Reels", specs: "1080x1080, 1080x1920", unit: "CPM", price: 3.5, objective: "Reach", alloc: 0.4 }] }],
    targeting: [{ platform: "Instagram", demographics: "Age 25-45, all genders", geographics: "Qatar", interests: "Travel, premium banking" }],
  };
  return `You are the head of media planning at Publicis Media Qatar. Draft the ONLINE part of a media plan for the brief. Use realistic 2026 Qatar market platforms and prices in USD per pricing unit (CPM, vCPM, CPV, CPCV, CPC, CPLP, CPE, CPL, CPA, CPI, Flat). Budget shares (alloc) inside each section must sum to 1, and the section totals must stay within the online budget. kpi must be one of: ${KPIS.join(", ")}. Prices are estimates for the planner to confirm; never present them as quoted rates.\n${ctx.client ? `Client: ${ctx.client}\n` : ""}${ctx.brand ? `Brand: ${ctx.brand}\n` : ""}${ctx.objective ? `Campaign objective: ${ctx.objective}\n` : ""}${ctx.audience ? `Target audience: ${ctx.audience}\n` : ""}${ctx.locations ? `Target locations: ${ctx.locations}\n` : ""}Return only JSON shaped exactly like this example:\n${JSON.stringify(example)}`;
}
