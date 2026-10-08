import { describe, it, expect } from "vitest";
import { classifyAsset, safeToRetire, retireSql } from "../scripts/auditInventoryLib.mjs";

const row = (o: Record<string, unknown>) => ({ assetName: "Corniche Mupi", locationName: "Corniche", publishedRates: 1, planItems: 0, dupes: 1, ...o });
const codes = (o: Record<string, unknown>) => classifyAsset(row(o)).map((f: { code: string }) => f.code);

describe("classifyAsset", () => {
  it("passes a normal asset", () => { expect(codes({})).toEqual([]); });
  it("flags footnote asterisks and section headings as junk", () => {
    expect(codes({ assetName: "TECHNICAL DETAILS**", locationName: "TECHNICAL DETAILS**" })).toContain("asterisks");
    expect(codes({ assetName: "Terms and conditions" })).toContain("section-header"); expect(codes({ assetName: "Notes:" })).toContain("section-header");
    expect(codes({ assetName: "Specifications" })).toContain("section-header");
  });
  it("never flags real newspaper and magazine ad placements", () => {
    for (const n of ["Page 2 & 3 — Full Page (48x28) (B/W)", "Page 4+ (Politics) — Quarter Page (25.2x15.5) (Colour)", "Pages 2/3 — Half Page", "Page 1 Strip Ad", "Back Page — Full Page (Colour)"]) expect(codes({ assetName: n, locationName: "Al Arab — Private Sector" })).toEqual([]);
  });
  it("does not mistake real names for headings", () => {
    expect(codes({ assetName: "Concrete Bridge (6 faces)" })).toEqual([]);
    expect(codes({ assetName: "Totalenergies Tower Billboard" })).toEqual([]);
    expect(codes({ assetName: "Notebook Cafe Wall" })).toEqual([]);
  });
  it("sends short and number-only names to review, never to junk (they are often real sizes)", () => {
    for (const n of ["A", "12-3", "13M", "10m(W) x 12m(H)", "GM 360"]) { const f = classifyAsset(row({ assetName: n })); expect(f.every((x: { level: string }) => x.level !== "junk")).toBe(true); }
    expect(codes({ assetName: "A" })).toContain("too-short"); expect(codes({ assetName: "12-3" })).toContain("no-words");
  });
  it("treats duplicates and missing rates as review, and name = location as info only", () => {
    expect(classifyAsset(row({ dupes: 3 })).find((f: { code: string }) => f.code === "duplicate")?.level).toBe("review");
    expect(classifyAsset(row({ publishedRates: 0 })).find((f: { code: string }) => f.code === "no-rate")?.level).toBe("review");
    expect(classifyAsset(row({ assetName: "Gewan Island", locationName: "gewan island" })).map((f: { level: string }) => f.level)).toEqual(["info"]);
  });
});

describe("retirement safety", () => {
  const junk = row({ assetName: "TECHNICAL DETAILS**" });
  it("proposes retiring only junk that no plan uses", () => {
    expect(safeToRetire(junk, classifyAsset(junk))).toBe(true);
    const used = row({ assetName: "TECHNICAL DETAILS**", planItems: 2 });
    expect(safeToRetire(used, classifyAsset(used))).toBe(false);
    expect(safeToRetire(row({ dupes: 4 }), classifyAsset(row({ dupes: 4 })))).toBe(false); // review-only is never auto-proposed
  });
  it("writes a reversible, quoted SQL script", () => {
    const s = retireSql(["a1", "o'brien"]);
    expect(s).toContain("'RETIRED'"); expect(s).toContain("'o''brien'"); expect(s).toContain("BEGIN;"); expect(s).toContain("COMMIT;"); expect(s).toContain("'ACTIVE'");
    expect(retireSql([])).toContain("Nothing to retire");
  });
});
