import { hasSection } from "@/lib/auth/modules";
import { NextRequest, NextResponse } from "next/server";
import { gatherPlanExportData, buildXlsxBuffer, buildCsvBuffer, buildPdfBuffer, exportFilename } from "@/lib/planning/exportPlan";
import { getSessionUser } from "@/lib/auth/session";

const CONTENT_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pdf: "application/pdf",
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ planId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasSection(user, "media", "plans"))) return new Response("You do not have access to the Media module.", { status: 403 });

  const { planId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("mode") === "internal" ? "internal" : "client";
  const versionIdParam = searchParams.get("v");
  const formatParam = searchParams.get("format");
  const format: keyof typeof CONTENT_TYPES = formatParam === "csv" ? "csv" : formatParam === "pdf" ? "pdf" : "xlsx";

  const data = await gatherPlanExportData(planId, versionIdParam, mode);
  if (!data) return NextResponse.json({ error: "Plan not found or has no version" }, { status: 404 });

  const buffer = format === "csv" ? buildCsvBuffer(data) : format === "pdf" ? await buildPdfBuffer(data) : buildXlsxBuffer(data);
  const filename = exportFilename(data, format);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
