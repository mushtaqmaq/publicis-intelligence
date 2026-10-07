import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export type SearchResult = { type: string; id: string; label: string; sublabel?: string; href: string };

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const [plans, clients, suppliers, assets] = await Promise.all([
    prisma.mediaPlan.findMany({
      where: { OR: [{ campaignName: { contains: q, mode: "insensitive" } }, { planCode: { contains: q, mode: "insensitive" } }] },
      select: { id: true, campaignName: true, planCode: true },
      take: 5,
    }),
    prisma.client.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true }, take: 5 }),
    prisma.supplier.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true }, take: 5 }),
    prisma.asset.findMany({
      where: { OR: [{ assetName: { contains: q, mode: "insensitive" } }, { locationName: { contains: q, mode: "insensitive" } }] },
      select: { id: true, assetName: true, locationName: true },
      take: 5,
    }),
  ]);

  const results: SearchResult[] = [
    ...plans.map((p) => ({ type: "Media Plan", id: p.id, label: p.campaignName, sublabel: p.planCode, href: `/media-plans/${p.id}` })),
    ...clients.map((c) => ({ type: "Client", id: c.id, label: c.name, href: `/clients` })),
    ...suppliers.map((s) => ({ type: "Supplier", id: s.id, label: s.name, href: `/suppliers/${s.id}` })),
    ...assets.map((a) => ({ type: "Inventory", id: a.id, label: a.assetName, sublabel: a.locationName, href: `/inventory/${a.id}` })),
  ];

  return NextResponse.json({ results });
}
