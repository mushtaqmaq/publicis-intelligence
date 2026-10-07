import "server-only";
import PDFDocument from "pdfkit";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function money(v: unknown) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function gatherPhotosheetData(planId: string, versionIdParam: string | null) {
  const plan = await prisma.mediaPlan.findUnique({
    where: { id: planId },
    include: { client: true, versions: { orderBy: { versionNumber: "desc" }, select: { id: true } } },
  });
  if (!plan) return null;

  const versionId = (versionIdParam && plan.versions.some((v) => v.id === versionIdParam) ? versionIdParam : plan.versions[0]?.id) ?? null;
  if (!versionId) return null;

  const version = await prisma.mediaPlanVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          asset: {
            include: {
              supplier: true,
              mediaCategory: true,
              images: { where: { kind: "primary" }, take: 1 },
            },
          },
        },
      },
    },
  });

  return { plan, version };
}

type PhotosheetData = NonNullable<Awaited<ReturnType<typeof gatherPhotosheetData>>>;

export async function buildPhotosheetBuffer(data: PhotosheetData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (let i = 0; i < data.version.items.length; i++) {
    const item = data.version.items[i];
    const asset = item.asset;
    if (i > 0) doc.addPage();

    doc.fontSize(9).fillColor("#666").text(`${data.plan.campaignName} — ${data.plan.client.name}`, { continued: false });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor("#111").text(asset.assetName);
    doc.fontSize(11).fillColor("#555").text(`${asset.supplier.name} · ${asset.locationName}${asset.area ? `, ${asset.area}` : ""}`);
    doc.moveDown(0.75);

    const imageId = asset.images[0]?.id;
    let imageBuffer: Buffer | null = null;
    if (imageId) {
      const image = await prisma.assetImage.findUnique({ where: { id: imageId } });
      if (image) {
        try {
          const result = await get(image.url, { access: "private" });
          if (result?.stream) {
            const reader = (result.stream as unknown as ReadableStream<Uint8Array>).getReader();
            const parts: Uint8Array[] = [];
            for (;;) {
              const { done: streamDone, value } = await reader.read();
              if (streamDone) break;
              if (value) parts.push(value);
            }
            imageBuffer = Buffer.concat(parts.map((p) => Buffer.from(p)));
          }
        } catch {
          imageBuffer = null;
        }
      }
    }

    const imageAreaHeight = 260;
    const imageTop = doc.y;
    if (imageBuffer) {
      try {
        doc.image(imageBuffer, doc.page.margins.left, imageTop, {
          fit: [pageWidth, imageAreaHeight],
          align: "center",
        });
      } catch {
        doc
          .rect(doc.page.margins.left, imageTop, pageWidth, imageAreaHeight)
          .strokeColor("#ddd")
          .stroke();
        doc.fontSize(10).fillColor("#999").text("Image could not be rendered", doc.page.margins.left, imageTop + imageAreaHeight / 2, {
          width: pageWidth,
          align: "center",
        });
      }
    } else {
      doc.rect(doc.page.margins.left, imageTop, pageWidth, imageAreaHeight).strokeColor("#ddd").stroke();
      doc.fontSize(10).fillColor("#999").text("No photo on file", doc.page.margins.left, imageTop + imageAreaHeight / 2, {
        width: pageWidth,
        align: "center",
      });
    }

    doc.y = imageTop + imageAreaHeight + 20;
    doc.fontSize(10).fillColor("#111");

    const specs: Array<[string, string]> = [
      ["Media Category", asset.mediaCategory.name],
      ["Indoor/Outdoor", asset.indoorOutdoor],
    ];
    if (asset.format) specs.unshift(["Format", asset.format]);
    if (asset.numberOfFaces) specs.push(["Faces", String(asset.numberOfFaces)]);
    if (asset.numberOfScreens) specs.push(["Screens", String(asset.numberOfScreens)]);
    if (asset.numberOfCircuits) specs.push(["Circuits", String(asset.numberOfCircuits)]);
    if (asset.physicalWidth && asset.physicalHeight) {
      specs.push(["Size", `${asset.physicalWidth}${asset.physicalUnit} × ${asset.physicalHeight}${asset.physicalUnit}`]);
    }
    if (asset.screenResolutionWidth && asset.screenResolutionHeight) {
      specs.push(["Resolution", `${asset.screenResolutionWidth} × ${asset.screenResolutionHeight}`]);
    }
    if (asset.illumination) specs.push(["Illumination", asset.illumination]);
    specs.push(["Campaign Dates", `${fmtDate(item.startDate)} to ${fmtDate(item.endDate)}`]);
    specs.push(["Quantity Booked", String(item.selectedCircuits ?? item.selectedFaces ?? 1)]);
    const total = money(item.lineTotal);
    specs.push(["Line Total", total !== null ? `QAR ${total.toLocaleString()}` : item.excludesPendingCost ? "TBD" : "—"]);

    const colWidth = pageWidth / 2;
    const specsBaseY = doc.y;
    specs.forEach(([label, value], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = doc.page.margins.left + col * colWidth;
      const y = specsBaseY + row * 18;
      doc.fontSize(8).fillColor("#888").text(label.toUpperCase(), x, y, { lineBreak: false, width: 85 });
      doc.fontSize(10).fillColor("#111").text(value, x + 90, y, { lineBreak: false, width: colWidth - 100 });
    });
  }

  doc.end();
  return done;
}
