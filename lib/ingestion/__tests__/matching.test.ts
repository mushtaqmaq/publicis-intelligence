import { describe, it, expect } from "vitest";
import { findAssetMatches, MATCH_CONFIDENT_THRESHOLD, MATCH_AMBIGUOUS_GAP } from "../matching";
import type { MatchableAsset } from "../matching";

const assets: MatchableAsset[] = [
  { id: "1", assetName: "MUPIS", locationName: "Doha", area: "Doha" },
  { id: "2", assetName: "SENIORS", locationName: "Al Rayyan", area: "Al Rayyan" },
  { id: "3", assetName: "Digital Screen", locationName: "The Halo", area: "The Halo" },
];

describe("findAssetMatches", () => {
  it("matches a close-but-not-identical name (real Excel-vs-PDF naming drift)", () => {
    const matches = findAssetMatches("MUPI AL RAYYAN", null, [
      ...assets,
      { id: "4", assetName: "MUPI Al Rayyan", locationName: "Al Rayyan", area: "Al Rayyan" },
    ]);
    expect(matches[0].asset.id).toBe("4");
    expect(matches[0].score).toBeGreaterThanOrEqual(MATCH_CONFIDENT_THRESHOLD);
  });

  it("does not confidently match an unrelated asset", () => {
    const matches = findAssetMatches("Giant Banner East West", "City Center Mall", assets);
    const top = matches[0];
    expect(!top || top.score < MATCH_CONFIDENT_THRESHOLD).toBe(true);
  });

  it("ranks an exact name+location match highest", () => {
    const matches = findAssetMatches("SENIORS", "Al Rayyan", assets);
    expect(matches[0].asset.id).toBe("2");
  });

  // Real bug found while hand-correcting Scoop's 2026 rate card: a stored
  // asset name with a missing space ("Light PolesMain Boulevard / Medina
  // Centrale") tokenizes as one glued word, dragging its score below a
  // differently-located sibling asset that tokenizes cleanly ("Light Poles
  // Main Boulevard"). The matcher itself isn't expected to fix glued-word
  // names, but the score gap between the two candidates must stay inside
  // MATCH_AMBIGUOUS_GAP so the caller's CONFLICT logic catches it — this
  // guards against the gap silently widening past that threshold if the
  // scoring function ever changes.
  it("keeps a close score gap between two similarly-named assets even when one has a tokenization glitch", () => {
    const siblings: MatchableAsset[] = [
      { id: "boulevard", assetName: "Light Poles Main Boulevard", locationName: "Pearl", area: "Pearl" },
      {
        id: "medina",
        assetName: "Light PolesMain Boulevard / Medina Centrale", // missing space, as actually stored
        locationName: "Pearl",
        area: "Pearl",
      },
    ];
    const matches = findAssetMatches("Light Poles", "Main Boulevard / Medina Centrale", siblings);
    expect(matches).toHaveLength(2);
    const gap = matches[0].score - matches[1].score;
    expect(gap).toBeLessThan(MATCH_AMBIGUOUS_GAP);
  });
});
