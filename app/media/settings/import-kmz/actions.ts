"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { parseKmz } from "@/lib/geocoding/kmz";
import { matchKmzToSupplier } from "@/lib/geocoding/kmzMatch";
import type { Prisma } from "@/generated/prisma/client";

const ALL_SUPPLIERS = "__ALL__";

export async function importKmzAction(formData: FormData) {
  const user = await requireMediaUser();
  const supplierId = formData.get("supplierId") as string;
  const file = formData.get("file") as File | null;
  const combined = supplierId === ALL_SUPPLIERS;

  if (!supplierId) {
    redirect("/media/settings/import-kmz?error=" + encodeURIComponent("A supplier (or 'All suppliers') must be selected."));
  }
  if (!file || file.size === 0) {
    redirect("/media/settings/import-kmz?error=" + encodeURIComponent("A KMZ or KML file must be selected."));
  }

  const supplier = combined ? null : await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const buffer = Buffer.from(await file!.arrayBuffer());

  let placemarks;
  try {
    placemarks = await parseKmz(buffer);
  } catch (err) {
    redirect(
      "/media/settings/import-kmz?error=" +
        encodeURIComponent(`Could not read "${file!.name}": ${err instanceof Error ? err.message : String(err)}`)
    );
  }

  if (placemarks!.length === 0) {
    redirect("/media/settings/import-kmz?error=" + encodeURIComponent(`No named placemarks with coordinates found in "${file!.name}".`));
  }

  const assetRows = await prisma.asset.findMany({
    where: combined ? {} : { supplierId },
    select: {
      id: true,
      assetName: true,
      locationName: true,
      area: true,
      latitude: true,
      supplier: { select: { name: true } },
    },
  });
  const assets = assetRows.map((a) => ({ ...a, supplierName: a.supplier.name }));

  const result = matchKmzToSupplier(placemarks!, assets);

  for (const c of result.applied) {
    await prisma.asset.update({ where: { id: c.assetId }, data: { latitude: c.lat, longitude: c.lon } });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "KMZ_IMPORTED",
      entityType: combined ? "AllSuppliers" : "Supplier",
      entityId: combined ? null : supplierId,
      newValue: {
        filename: file!.name,
        supplier: combined ? "All suppliers (combined)" : supplier!.name,
        placemarkCount: placemarks!.length,
        appliedCount: result.applied.length,
        skippedAlreadyGeocoded: result.skippedAlreadyGeocoded.length,
        pendingCount: result.pending.length,
      },
    },
  });

  let batchId: string | null = null;
  if (result.pending.length > 0) {
    const batch = await prisma.kmzImportBatch.create({
      data: {
        filename: file!.name,
        supplierId: combined ? null : supplierId,
        uploadedById: user.id,
        pending: result.pending as unknown as Prisma.InputJsonValue,
      },
    });
    batchId = batch.id;
  }

  const summary = {
    filename: file!.name,
    supplierName: combined ? "All suppliers (combined)" : supplier!.name,
    placemarkCount: placemarks!.length,
    applied: result.applied
      .slice(0, 25)
      .map((c) => ({ n: c.placemarkName, a: c.assetName, l: c.locationName, sup: c.supplierName, s: Math.round(c.score * 100) })),
    appliedCount: result.applied.length,
    skippedAlreadyGeocoded: result.skippedAlreadyGeocoded.length,
    pendingCount: result.pending.length,
    batchId,
  };

  redirect("/media/settings/import-kmz?result=" + encodeURIComponent(JSON.stringify(summary)));
}
