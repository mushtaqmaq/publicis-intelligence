/**
 * Duplicate-asset matching. Per the project's own rule, this NEVER
 * auto-merges — it only proposes a match with a score, for the review
 * screen (or the publish step) to accept or reject. Deliberately simple:
 * normalized token-overlap plus a substring bonus, no external NLP
 * dependency. Good enough to catch "MUPIS · Doha" vs "MUPI Doha", not
 * good enough to be trusted blindly — which is exactly why it never
 * merges on its own.
 */

export interface MatchableAsset {
  id: string;
  assetName: string;
  locationName: string;
  area: string | null;
}

export interface MatchResult {
  asset: MatchableAsset;
  score: number; // 0..1
}

const STOPWORDS = new Set(["the", "at", "in", "of", "and", "-", "·"]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function candidateKey(name: string, location: string | null): string {
  return `${name} ${location ?? ""}`;
}

/** Returns matches sorted best-first, so the caller can decide whether the
 *  top match is confident enough, or whether the top two are too close to
 *  call automatically (a CONFLICT rather than a clean match). */
export function findAssetMatches(
  candidateName: string,
  candidateLocation: string | null,
  existingAssets: MatchableAsset[]
): MatchResult[] {
  const candidateTokens = tokens(candidateKey(candidateName, candidateLocation));

  const scored = existingAssets.map((asset) => {
    const assetTokens = tokens(candidateKey(asset.assetName, asset.area ?? asset.locationName));
    let score = jaccard(candidateTokens, assetTokens);

    const normCandidate = normalize(candidateName);
    const normAsset = normalize(asset.assetName);
    if (normCandidate.includes(normAsset) || normAsset.includes(normCandidate)) {
      score = Math.min(1, score + 0.2);
    }

    return { asset, score };
  });

  return scored.sort((a, b) => b.score - a.score).filter((m) => m.score > 0);
}

export const MATCH_CONFIDENT_THRESHOLD = 0.55;
export const MATCH_AMBIGUOUS_GAP = 0.1;
