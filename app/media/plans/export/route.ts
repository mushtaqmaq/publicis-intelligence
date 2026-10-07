import { NextRequest, NextResponse } from "next/server";
import { gatherPlanListExportData, buildListXlsxBuffer, buildListCsvBuffer, buildListPdfBuffer, exportListFilename } from "@/lib/planning/exportPlanList";
import { getSessionUser } from "@/lib/auth/session";
import type { MediaPlanStatus } from "@/generated/prisma/enums";

const CONTENT_TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pdf: "application/pdf",
} as const;

const VALID_STATUSES: MediaPlanStatus[] = [
  "DRAFT",
  "PLANNING",
  "INTERNAL_REVIEW",
  "CLIENT_SHARED",
  "APPROVED",
  "AWAITING_ARTWORK",
  "BOOKED",
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
];

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const searchParams = req.nextUrl.searchParams;
  const statusParam = searchParams.get("status");
  const status = statusParam && (VALID_STATUSES as string[]).includes(statusParam) ? (statusParam as MediaPlanStatus) : undefined;
  const yearParam = searchParams.get("year");
  const year = yearParam && Number.isFinite(Number(yearParam)) ? Number(yearParam) : undefined;
  const formatParam = searchParams.get("format");
  const format: keyof typeof CONTENT_TYPES = formatParam === "csv" ? "csv" : formatParam === "pdf" ? "pdf" : "xlsx";

  const data = await gatherPlanListExportData({ status, year });
  const buffer = format === "csv" ? buildListCsvBuffer(data) : format === "pdf" ? await buildListPdfBuffer(data) : buildListXlsxBuffer(data);
  const filename = exportListFilename(data, format);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
