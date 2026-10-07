/**
 * Pure bridging logic between a stored AssetRate (+ its fees) and the
 * calculation engine's LineItemInput shape. Kept dependency-free (no
 * Prisma import) so it's trivially unit-testable — all the DB access
 * happens in rateResolution.ts, which calls this with plain data.
 */
import {
  calculateLineItem,
  KNOWN,
  TBD,
  LEGACY_PERIOD_DAYS,
  type LineItemInput,
  type LineItemResult,
  type MoneyValue,
  type PricingCalculationMethod,
} from "@/lib/engine/calculation";

export interface RateFeeInput {
  feeType: string;
  status: string; // MoneyStatus
  amount: number | null;
}

export interface RateInput {
  grossRateStatus: string; // MoneyStatus
  grossRate: number | null;
  durationValue: number | null;
  durationUnit: string | null;
  fees: RateFeeInput[];
}

function toMoneyValue(status: string, amount: number | null): MoneyValue {
  if (status === "KNOWN" && amount !== null) return KNOWN(amount);
  if (status === "TBD") return TBD;
  return { status: status as MoneyValue["status"], amount: null };
}

/** Maps a stored duration (value + unit) onto the legacy fixed-day table
 *  used only by PRO_RATA — returns null for anything that isn't one of
 *  the five periods the original Excel workbook itself supported. */
export function legacyPeriodKeyFromDuration(
  durationValue: number | null,
  durationUnit: string | null
): keyof typeof LEGACY_PERIOD_DAYS | null {
  if (durationValue === null || !durationUnit) return null;
  const unit = durationUnit.toLowerCase();
  if (unit === "weeks" && durationValue === 2) return "2_WEEKS";
  if (unit === "weeks" && durationValue === 4) return "4_WEEKS";
  if (unit === "months" && durationValue === 3) return "3_MONTHS";
  if (unit === "months" && durationValue === 6) return "6_MONTHS";
  if (unit === "months" && durationValue === 12) return "12_MONTHS";
  return null;
}

export function campaignDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

export interface BuildLineItemArgs {
  calculationMethod: PricingCalculationMethod;
  rate: RateInput;
  campaignStart: Date;
  campaignEnd: Date;
  quantity: number;
  discountPct: number;
  additionalDiscountPct: number;
}

export function buildAndCalculateLineItem(args: BuildLineItemArgs): {
  input: LineItemInput;
  result: LineItemResult;
  legacyPeriodKey: ReturnType<typeof legacyPeriodKeyFromDuration>;
} {
  const legacyPeriodKey =
    args.calculationMethod === "PRO_RATA"
      ? legacyPeriodKeyFromDuration(args.rate.durationValue, args.rate.durationUnit)
      : null;

  const feeByType = (type: string) => args.rate.fees.find((f) => f.feeType === type);
  const fees: LineItemInput["fees"] = {};
  for (const type of ["production", "upload", "installation", "service", "other"] as const) {
    const f = feeByType(type);
    if (f) fees[type] = toMoneyValue(f.status, f.amount);
  }

  const input: LineItemInput = {
    calculationMethod: args.calculationMethod,
    legacyPeriodKey: legacyPeriodKey ?? undefined,
    campaignDays: campaignDaysBetween(args.campaignStart, args.campaignEnd),
    quantity: args.quantity,
    grossRate: toMoneyValue(args.rate.grossRateStatus, args.rate.grossRate),
    discountPct: args.discountPct,
    additionalDiscountPct: args.additionalDiscountPct,
    fees,
  };

  return { input, result: calculateLineItem(input), legacyPeriodKey };
}
