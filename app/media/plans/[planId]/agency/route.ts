import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasSection } from "@/lib/auth/modules";
import { gatherAgencyPlan, agencyFilename } from "@/lib/planning/agencyExport";
import { buildAgencyWorkbook } from "@/lib/planning/agencyWorkbook";
import { buildAgencyPdf } from "@/lib/planning/agencyPdf";

// Agency-format Excel or PDF (?format=pdf), Publicis Media Qatar layout.
export async function GET(req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasSection(user, "media", "plans"))) return new Response("You do not have access to the Media module.", { status: 403 });

  const { planId } = await params;
  const data = await gatherAgencyPlan(planId, req.nextUrl.searchParams.get("v"));
  if (!data) return NextResponse.json({ error: "Plan not found or has no version" }, { status: 404 });

  const pdf = req.nextUrl.searchParams.get("format") === "pdf";
  const buffer = pdf ? await buildAgencyPdf(data.plan) : await buildAgencyWorkbook(data.plan);
  const filename = agencyFilename(data.clientName, data.campaign).replace(/\.xlsx$/, pdf ? ".pdf" : ".xlsx");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
