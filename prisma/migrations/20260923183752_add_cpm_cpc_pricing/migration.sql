-- Digital media (Meta, TikTok, Snapchat) is auction-based, not sold via a
-- published per-unit rate — the "rate" is a CPM/CPC benchmark used for
-- planning, never a contracted price. These values let a Digital asset
-- carry that shape without pretending it's a firm quote.

ALTER TYPE "PricingBasis" ADD VALUE 'PER_1000_IMPRESSIONS';
ALTER TYPE "PricingBasis" ADD VALUE 'PER_CLICK';

ALTER TYPE "PricingCalculationMethod" ADD VALUE 'CPM';
ALTER TYPE "PricingCalculationMethod" ADD VALUE 'CPC';
