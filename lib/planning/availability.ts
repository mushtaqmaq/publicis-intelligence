import "server-only";
import { prisma } from "@/lib/prisma";

// Statuses at which a plan's booking of an asset is a real commitment,
// not just a draft/speculative one — matches LOCKING_STATUSES in
// media-plans/[planId]/actions.ts (a plan reaching one of these locks its
// version because the booking is considered final).
const COMMITTED_STATUSES = ["APPROVED", "BOOKED", "COMPLETED"] as const;

export interface AssetBooking {
  planId: string;
  campaignName: string;
  clientName: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Real committed bookings for an asset — derived from actual media plan
 * line items on APPROVED/BOOKED/COMPLETED plans, not a separate
 * AssetAvailability table (that model exists in the schema but has zero
 * rows and no ingestion path; this is the honest alternative: availability
 * computed from data that genuinely exists).
 */
export async function getAssetBookings(assetId: string): Promise<AssetBooking[]> {
  const items = await prisma.mediaPlanItem.findMany({
    where: {
      assetId,
      mediaPlanVersion: {
        mediaPlan: { status: { in: [...COMMITTED_STATUSES] } },
      },
    },
    include: {
      mediaPlanVersion: {
        include: { mediaPlan: { include: { client: true } } },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Only the plan's CURRENT (latest) version counts — a superseded
  // version's items aren't a real booking anymore.
  const latestVersionIds = new Map<string, string>();
  for (const item of items) {
    const planId = item.mediaPlanVersion.mediaPlanId;
    if (!latestVersionIds.has(planId)) {
      const latest = await prisma.mediaPlanVersion.findFirst({
        where: { mediaPlanId: planId },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      if (latest) latestVersionIds.set(planId, latest.id);
    }
  }

  return items
    .filter((item) => item.mediaPlanVersionId === latestVersionIds.get(item.mediaPlanVersion.mediaPlanId))
    .map((item) => ({
      planId: item.mediaPlanVersion.mediaPlanId,
      campaignName: item.mediaPlanVersion.mediaPlan.campaignName,
      clientName: item.mediaPlanVersion.mediaPlan.client.name,
      status: item.mediaPlanVersion.mediaPlan.status,
      startDate: item.startDate,
      endDate: item.endDate,
    }));
}

export function findConflicts(bookings: AssetBooking[], startDate: Date, endDate: Date): AssetBooking[] {
  return bookings.filter((b) => rangesOverlap(startDate, endDate, b.startDate, b.endDate));
}
