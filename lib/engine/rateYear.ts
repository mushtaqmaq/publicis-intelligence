/**
 * Rate-year selection logic.
 *
 * Business rule (never deviate from this without explicit sign-off — see
 * the project brief's "RATE YEAR SELECTION LOGIC" section):
 *
 *   selectedRateYear = MAX(rate_year WHERE rate_year <= campaignYear)
 *
 * - Never fall back to a future year's rate.
 * - If nothing at or before the campaign year exists, there is no valid rate.
 * - If multiple published versions exist in the selected year, prefer the
 *   most recently published one whose effective window covers the campaign
 *   start date.
 */

export interface RateYearCandidate {
  rateYear: number;
  /** Opaque id of the AssetRate / RateCardVersion this candidate came from. */
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /** Later publish = preferred, when years and coverage tie. */
  publishedAt: Date | null;
}

export type RateYearSelection =
  | {
      found: true;
      selected: RateYearCandidate;
      isFallback: boolean;
      requestedYear: number;
    }
  | {
      found: false;
      reason: "NO_RATE_AT_OR_BEFORE_CAMPAIGN_YEAR";
      requestedYear: number;
    };

export function campaignYearOf(campaignStart: Date): number {
  return campaignStart.getUTCFullYear();
}

/**
 * Picks the correct rate-year candidate for a given campaign start date.
 *
 * Candidates from years AFTER the campaign year are excluded entirely
 * before any comparison happens, so a future rate can never leak in via a
 * tie-break or a bad sort.
 */
export function selectRateYear(
  candidates: RateYearCandidate[],
  campaignStart: Date
): RateYearSelection {
  const requestedYear = campaignYearOf(campaignStart);

  const eligible = candidates.filter((c) => c.rateYear <= requestedYear);
  if (eligible.length === 0) {
    return { found: false, reason: "NO_RATE_AT_OR_BEFORE_CAMPAIGN_YEAR", requestedYear };
  }

  const maxYear = Math.max(...eligible.map((c) => c.rateYear));
  const inMaxYear = eligible.filter((c) => c.rateYear === maxYear);

  // Prefer a version whose effective window actually covers the campaign
  // start; fall back to the most recently published if several qualify or
  // none states an explicit window.
  const covering = inMaxYear.filter(
    (c) =>
      c.effectiveFrom <= campaignStart &&
      (c.effectiveTo === null || c.effectiveTo >= campaignStart)
  );
  const pool = covering.length > 0 ? covering : inMaxYear;

  const selected = [...pool].sort((a, b) => {
    const aTime = a.publishedAt?.getTime() ?? 0;
    const bTime = b.publishedAt?.getTime() ?? 0;
    return bTime - aTime;
  })[0];

  return {
    found: true,
    selected,
    isFallback: maxYear !== requestedYear,
    requestedYear,
  };
}
