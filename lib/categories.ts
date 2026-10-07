import "server-only";
import { prisma } from "@/lib/prisma";

// New assets created by an automated pipeline (rate-card ingestion, Excel
// migration) never know the real category — an Admin triages that later in
// Settings > Asset Categories — so they always land in "Other".
export async function getDefaultAssetCategoryId(): Promise<string> {
  const other = await prisma.assetCategory.findUniqueOrThrow({ where: { name: "Other" } });
  return other.id;
}
