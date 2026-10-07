/**
 * Media-plan line-item calculation engine.
 *
 * This intentionally does NOT assume one universal formula. Real supplier
 * rate cards (see docs/reconciliation-notes.md) mix:
 *   - per-circuit / per-pole / per-screen / per-face unit pricing,
 *   - bundle pricing ("rate per 4 screens" as one price, Scoop),
 *   - fixed packages (Break Media "City Centre Domination"),
 *   - period-tiered pricing with NO 2-week base at all (Elan Seniors:
 *     1/3/6/12-month rates only).
 *
 * `PRO_RATA` reproduces the current Excel workbook's own formula exactly
 * (see the "Legacy Pro-Rata" test fixtures, taken from live cells in
 * OOH_Rates_2026.xlsx) so old and new numbers can be reconciled. It is
 * deliberately NOT the default calculation method for new assets ingested
 * from source rate cards — `pricingCalculationMethod` on the asset decides.
 */

export type MoneyStatus =
  | "KNOWN"
  | "TBD"
  | "NOT_APPLICABLE"
  | "ON_REQUEST"
  | "POA"
  | "TO_BE_CONFIRMED";

export interface MoneyValue {
  status: MoneyStatus;
  amount: number | null; // null unless status === "KNOWN"
}

export const KNOWN = (amount: number): MoneyValue => ({ status: "KNOWN", amount });
export const TBD: MoneyValue = { status: "TBD", amount: null };

export type PricingCalculationMethod =
  | "FIXED"
  | "PRO_RATA"
  | "DAILY"
  | "PER_FACE_DAILY"
  | "PER_FACE"
  | "PER_CIRCUIT"
  | "PER_SPOT"
  | "PER_INSERTION"
  | "PER_MESSAGE"
  | "PER_SCREEN"
  | "PER_NETWORK"
  | "PER_POLE"
  | "CPM"
  | "CPC"
  | "MONTHLY"
  | "CUSTOM";

/** Fixed day-equivalents used only by legacy PRO_RATA, matching the Excel
 *  workbook's own hard-coded table exactly. */
export const LEGACY_PERIOD_DAYS: Record<string, number> = {
  "2_WEEKS": 14,
  "4_WEEKS": 28,
  "3_MONTHS": 90,
  "6_MONTHS": 180,
  "12_MONTHS": 365,
};

export interface LineItemInput {
  calculationMethod: PricingCalculationMethod;
  /** Only meaningful for PRO_RATA. */
  legacyPeriodKey?: keyof typeof LEGACY_PERIOD_DAYS;
  campaignDays: number;
  quantity: number; // circuits / faces / screens / poles / networks, as applicable
  grossRate: MoneyValue; // the unit (or package) rate actually quoted
  discountPct: number; // 0..1
  additionalDiscountPct: number; // 0..1, manually added on top
  fees: {
    production?: MoneyValue;
    upload?: MoneyValue;
    installation?: MoneyValue;
    service?: MoneyValue;
    other?: MoneyValue;
  };
  /** Fees are typically per-unit (per circuit/pole/etc), not pro-rated by days. */
  feesScaleWithQuantity?: boolean; // default true
}

export interface LineItemResult {
  grossCost: MoneyValue;
  netMedia: MoneyValue;
  productionFee: MoneyValue;
  uploadFee: MoneyValue;
  installationFee: MoneyValue;
  serviceFee: MoneyValue;
  otherFees: MoneyValue;
  lineTotal: MoneyValue;
  /** true if grossRate or any fee is not a known number, so totals are partial. */
  excludesPendingCost: boolean;
}

function scaleFee(fee: MoneyValue | undefined, quantity: number, scale: boolean): MoneyValue {
  if (!fee || fee.status !== "KNOWN" || fee.amount === null) {
    return fee ?? { status: "NOT_APPLICABLE", amount: null };
  }
  return KNOWN(scale ? fee.amount * quantity : fee.amount);
}

function sumKnown(values: MoneyValue[]): { sum: number; anyUnknown: boolean } {
  let sum = 0;
  let anyUnknown = false;
  for (const v of values) {
    if (v.status === "KNOWN" && v.amount !== null) {
      sum += v.amount;
    } else if (v.status !== "NOT_APPLICABLE") {
      // TBD / ON_REQUEST / POA / TO_BE_CONFIRMED are meaningful non-zero unknowns
      anyUnknown = true;
    }
  }
  return { sum, anyUnknown };
}

export function calculateLineItem(input: LineItemInput): LineItemResult {
  const feesScale = input.feesScaleWithQuantity ?? true;

  // --- Gross cost -----------------------------------------------------
  let grossCost: MoneyValue;

  if (input.grossRate.status !== "KNOWN" || input.grossRate.amount === null) {
    grossCost = input.grossRate;
  } else {
    const rate = input.grossRate.amount;
    switch (input.calculationMethod) {
      case "FIXED": {
        // Exact package price. No pro-ration, no per-unit multiplication.
        grossCost = KNOWN(rate);
        break;
      }
      case "PRO_RATA": {
        const periodDays = input.legacyPeriodKey
          ? LEGACY_PERIOD_DAYS[input.legacyPeriodKey]
          : undefined;
        if (!periodDays || periodDays === 0) {
          grossCost = KNOWN(0);
        } else {
          // Matches OOH_Rates_2026.xlsx Quote Calculator column P exactly:
          // Gross = Rate * (Days / Period) * Circuits
          grossCost = KNOWN(rate * (input.campaignDays / periodDays) * input.quantity);
        }
        break;
      }
      case "DAILY":
      case "PER_FACE_DAILY": {
        grossCost = KNOWN(rate * input.campaignDays * input.quantity);
        break;
      }
      case "PER_CIRCUIT":
      case "PER_SCREEN":
      case "PER_NETWORK":
      case "PER_FACE":
      case "PER_POLE":
      case "PER_SPOT":
      case "PER_INSERTION":
      case "PER_MESSAGE":
      case "CPC": {
        // Per-unit price, not pro-rated by days — the quoted rate is for
        // one whole unit (one circuit / screen / on-air spot / print
        // insertion / SMS blast / ad click), so the line item is just
        // rate x however many units are being bought.
        grossCost = KNOWN(rate * input.quantity);
        break;
      }
      case "CPM": {
        // Digital only: rate is quoted per 1,000 impressions, so the line
        // item is rate x (impressions / 1000), never pro-rated by days.
        grossCost = KNOWN(rate * (input.quantity / 1000));
        break;
      }
      case "MONTHLY": {
        // `grossRate` must already be the exact tier the caller selected
        // (1/3/6/12 month); never interpolated here.
        grossCost = KNOWN(rate * input.quantity);
        break;
      }
      case "CUSTOM":
      default: {
        grossCost = KNOWN(rate * input.quantity);
        break;
      }
    }
  }

  // --- Net media --------------------------------------------------------
  let netMedia: MoneyValue;
  if (grossCost.status !== "KNOWN" || grossCost.amount === null) {
    netMedia = grossCost;
  } else {
    const totalDiscount = (input.discountPct || 0) + (input.additionalDiscountPct || 0);
    netMedia = KNOWN(grossCost.amount * (1 - totalDiscount));
  }

  // --- Fees ---------------------------------------------------------------
  const productionFee = scaleFee(input.fees.production, input.quantity, feesScale);
  const uploadFee = scaleFee(input.fees.upload, input.quantity, feesScale);
  const installationFee = scaleFee(input.fees.installation, input.quantity, feesScale);
  const serviceFee = scaleFee(input.fees.service, input.quantity, feesScale);
  const otherFees = scaleFee(input.fees.other, input.quantity, feesScale);

  const { sum, anyUnknown } = sumKnown([
    netMedia,
    productionFee,
    uploadFee,
    installationFee,
    serviceFee,
    otherFees,
  ]);

  const grossUnknown = grossCost.status !== "KNOWN";
  const lineTotal: MoneyValue =
    grossUnknown && netMedia.status !== "KNOWN"
      ? netMedia
      : KNOWN(sum);

  return {
    grossCost,
    netMedia,
    productionFee,
    uploadFee,
    installationFee,
    serviceFee,
    otherFees,
    lineTotal,
    excludesPendingCost: anyUnknown || grossUnknown,
  };
}
