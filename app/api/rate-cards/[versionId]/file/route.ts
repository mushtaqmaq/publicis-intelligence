import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

const CONTENT_TYPES: Record<string, string> = {
  PDF: "application/pdf",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  XLS: "application/vnd.ms-excel",
  CSV: "text/csv",
};

/**
 * Streams the original supplier rate-card file from the private Blob
 * store, the same pattern as /api/asset-images/[imageId] — the store is
 * private, so the raw storageUrl is never exposed to the client. This is
 * the "view the original rate-card PDF from the app" gap called out in
 * docs/ingestion-notes.md's Phase 2 not-yet-built list.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { versionId } = await params;

  const version = await prisma.rateCardVersion.findUnique({
    where: { id: versionId },
    select: { storageUrl: true, originalFilename: true, fileType: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Rate card version not found" }, { status: 404 });
  }

  // The Phase 1 Excel migration wrote a local filesystem path into
  // storageUrl (see scripts/migrate-excel.ts), not a Blob pathname — that
  // source file was never uploaded to Blob storage, so there is nothing
  // to stream back for it.
  if (!version.storageUrl.startsWith("http")) {
    return NextResponse.json(
      { error: "This rate card's source is the Excel migration, not a stored document — there is no original file to view." },
      { status: 404 }
    );
  }

  let result;
  try {
    result = await get(version.storageUrl, { access: "private" });
  } catch {
    return NextResponse.json({ error: "Rate card file content not found" }, { status: 404 });
  }
  if (!result || !result.stream) {
    return NextResponse.json({ error: "Rate card file content not found" }, { status: 404 });
  }

  const contentType = result.blob.contentType ?? CONTENT_TYPES[version.fileType] ?? "application/octet-stream";
  const disposition = version.fileType === "PDF" ? "inline" : "attachment";

  return new NextResponse(result.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${version.originalFilename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
