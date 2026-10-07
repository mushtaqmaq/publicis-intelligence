import type { MediaChannel, PricingCalculationMethod } from "@/generated/prisma/enums";

export interface BookingUnit {
  quantityLabel: string;
  quantityHint: string;
  rateLabel: string;
}

// Booking is genuinely different per medium: an OOH line is a count of
// physical faces/circuits, a TV/Radio line is a count of on-air spots, a
// Print line is a count of insertions (appearances in a publication run),
// a Cinema line is a count of screens, and an SMS line is a count of
// messages sent. Same underlying form, different vocabulary and defaults.
const BOOKING_UNITS: Record<MediaChannel, BookingUnit> = {
  OOH: {
    quantityLabel: "Quantity",
    quantityHint: "Circuits / faces / screens, as applicable.",
    rateLabel: "Rate / Period",
  },
  RADIO: {
    quantityLabel: "Number of Spots",
    quantityHint: "How many times this spot airs at this duration and daypart.",
    rateLabel: "Spot Rate",
  },
  TV: {
    quantityLabel: "Number of Spots",
    quantityHint: "How many times this spot airs at this duration and daypart.",
    rateLabel: "Spot Rate",
  },
  PRINT: {
    quantityLabel: "Number of Insertions",
    quantityHint: "How many times this ad appears — each insertion is one appearance at this page position and size in one publication run.",
    rateLabel: "Insertion Rate",
  },
  CINEMA: {
    quantityLabel: "Number of Screens",
    quantityHint: "How many cinema screens this booking covers, for the selected package/run.",
    rateLabel: "Screen Package Rate",
  },
  SMS: {
    quantityLabel: "Number of Messages",
    quantityHint: "Total SMS messages to be sent in this campaign.",
    rateLabel: "Rate per Message",
  },
  DIGITAL: {
    quantityLabel: "Quantity",
    quantityHint: "Units / impressions, as applicable for this digital placement.",
    rateLabel: "Rate",
  },
};

// Digital assets can be priced either way (CPM for awareness/reach, CPC
// for traffic/conversion objectives) under the same DIGITAL channel, so
// the calculation method — not just the channel — decides the label here.
const METHOD_OVERRIDES: Partial<Record<PricingCalculationMethod, BookingUnit>> = {
  CPM: {
    quantityLabel: "Number of Impressions",
    quantityHint: "Total ad impressions to buy. Cost is calculated per 1,000 impressions (CPM) — this is a planning benchmark, not a contracted rate.",
    rateLabel: "CPM (per 1,000 impressions)",
  },
  CPC: {
    quantityLabel: "Number of Clicks",
    quantityHint: "Total ad clicks to buy. Cost is calculated per click (CPC) — this is a planning benchmark, not a contracted rate.",
    rateLabel: "CPC (per click)",
  },
};

export function getBookingUnit(mediaChannel: MediaChannel, calculationMethod?: PricingCalculationMethod): BookingUnit {
  if (calculationMethod && METHOD_OVERRIDES[calculationMethod]) return METHOD_OVERRIDES[calculationMethod]!;
  return BOOKING_UNITS[mediaChannel] ?? BOOKING_UNITS.OOH;
}
