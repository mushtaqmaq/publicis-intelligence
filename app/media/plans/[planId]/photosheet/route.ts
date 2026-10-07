import { NextRequest, NextResponse } from "next/server";
import { gatherPhotosheetData, buildPhotosheetBuffer } from "@/lib/planning/photosheet";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { planId } = await params;
  const versionIdParam = req.nextUrl.searchParams.get("v");

  const data = await gatherPhotosheetData(planId, versionIdParam);
  if (!data) return NextResponse.json({ error: "Plan not found or has no version" }, { status: 404 });
  if (data.version.items.length === 0) {
    return NextResponse.json({ error: "This plan version has no assets to include in a photosheet." }, { status: 400 });
  }

  const buffer = await buildPhotosheetBuffer(data);
  const filename = `${data.plan.campaignName.replace(/[^a-z0-9]+/gi, "_")}_photosheet.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
