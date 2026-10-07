import { describe, it, expect } from "vitest";
import { readAiStream, extractJson, onlineDraftFromAi, draftSystemPrompt } from "../onlineDraft";
import { calcOnline } from "../online";

describe("readAiStream", () => {
  it("strips status lines and the META footer", () => {
    const raw = "\u0001STATUS:Thinking\n\u0001STATUS:Writing\n{\"a\":1}\u0000META:{\"model\":\"x\"}";
    expect(readAiStream(raw)).toEqual({ text: '{"a":1}' });
  });
  it("surfaces an error from the provider", () => {
    expect(readAiStream("\u0001STATUS:Writing\n\u0000ERR:No AI provider is configured.")).toEqual({ text: "", error: "No AI provider is configured." });
  });
});

describe("extractJson", () => {
  it("reads JSON wrapped in code fences and prose, including braces inside strings", () => {
    const j = extractJson('Here you go:\n```json\n{"sections":[{"name":"A {x}","rows":[]}]}\n```\nHope that helps') as { sections: { name: string }[] };
    expect(j.sections[0].name).toBe("A {x}");
  });
  it("throws a readable error when there is no JSON or it is cut off", () => {
    expect(() => extractJson("no plan here")).toThrow(/did not return a plan/);
    expect(() => extractJson('{"sections":[{"name":')).toThrow(/could not be read/);
  });
});

describe("onlineDraftFromAi", () => {
  const ai = { sections: [{ name: "Awareness", kpi: "Impressions", total: 100000, rows: [
    { platform: "Meta", format: "Reels", unit: "CPM", price: 5, alloc: 0.5 },
    { platform: "TikTok", unit: "CPV", price: 0.02, alloc: 0.3 },
  ] }], targeting: [{ platform: "Meta", demographics: "25-44" }] };

  it("builds an editable allocation block with every week flighted", () => {
    const d = onlineDraftFromAi(ai, "2026-11-01", "2026-11-30")!;
    expect(d.sections[0].mode).toBe("allocation");
    expect(d.sections[0].rows[0].weeks).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(d.targeting[0].platform).toBe("Meta");
  });
  it("scales shares that do not add up to 100% so the section spends its budget exactly", () => {
    const d = onlineDraftFromAi(ai, "2026-11-01", "2026-11-30")!; // 0.5 + 0.3 = 0.8 -> 62.5% / 37.5%
    const [calc] = calcOnline(d, "2026-11-01", "2026-11-30");
    expect(calc.rows[0].qar).toBeCloseTo(62500, 6); expect(calc.qar).toBeCloseTo(100000, 6);
  });
  it("spreads evenly when the model gave no shares", () => {
    const d = onlineDraftFromAi({ sections: [{ name: "X", total: 1000, rows: [{ platform: "A" }, { platform: "B" }] }] }, "2026-11-01", "2026-11-30")!;
    expect(d.sections[0].rows.map((r) => r.alloc)).toEqual([0.5, 0.5]);
  });
  it("replaces unknown units and KPIs with safe defaults and never accepts negatives", () => {
    const d = onlineDraftFromAi({ sections: [{ name: "X", kpi: "Vibes", total: -5, rows: [{ platform: "A", unit: "per fortnight", price: -3, alloc: 1 }] }] }, "2026-11-01", "2026-11-30")!;
    expect(d.sections[0].kpi).toBe("Impressions"); expect(d.sections[0].total).toBe(0);
    expect(d.sections[0].rows[0].unit).toBe("CPM"); expect(d.sections[0].rows[0].price).toBe(0);
  });
  it("returns null for anything unusable, and bounds sizes", () => {
    expect(onlineDraftFromAi(null, "2026-11-01", "2026-11-30")).toBeNull();
    expect(onlineDraftFromAi({ sections: [{ name: "empty", rows: [] }] }, "2026-11-01", "2026-11-30")).toBeNull();
    const big = { sections: Array.from({ length: 50 }, () => ({ name: "S", rows: [{ platform: "P" }] })) };
    expect(onlineDraftFromAi(big, "2026-11-01", "2026-11-30")!.sections.length).toBe(12);
  });
});

describe("draftSystemPrompt", () => {
  it("includes the plan context and tells the model prices are estimates", () => {
    const p = draftSystemPrompt({ client: "QNB", brand: "QNB Mobile", objective: "Drive sign-ups", audience: null, locations: "Doha" });
    expect(p).toContain("QNB"); expect(p).toContain("Drive sign-ups"); expect(p).toContain("Doha"); expect(p).toContain("estimates");
    expect(p).not.toContain("Target audience");
  });
});
