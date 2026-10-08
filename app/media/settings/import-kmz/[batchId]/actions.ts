"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import type { Prisma } from "@/generated/prisma/client";
import { detectPrefix } from "@/lib/geocoding/kmzPrefix";

interface PendingPlacemark {
  name: string;
  lat: number;
  lon: number;
  reason: string;
}

// A supplier's own circuit numbering (Elan's "SE-009", "MU-114"...) usually
// groups many physical units under one product-type asset — so assigning a
// second, third, ... Nth point to the same asset is expected here, not an
// error. The first-ever point for an asset lives on Asset.latitude/longitude
// (the common single-location case); the moment a second point arrives, the
// original is migrated into AssetLocation alongside the new one so nothing
// is lost and the Map can plot every real location instead of just one.
async function assignPlacemarkToAsset(assetId: string, lat: number, lon: number, label: string) {
  const asset = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    include: { _count: { select: { locations: true } } },
  });

  if (asset.latitude === null && asset._count.locations === 0) {
    await prisma.asset.update({ where: { id: assetId }, data: { latitude: lat, longitude: lon } });
    return;
  }

  if (asset.latitude !== null && asset._count.locations === 0) {
    await prisma.assetLocation.create({
      data: { assetId, label: asset.assetName, latitude: asset.latitude, longitude: asset.longitude! },
    });
  }
  await prisma.assetLocation.create({ data: { assetId, label, latitude: lat, longitude: lon } });
}

function getPending(batchPending: Prisma.JsonValue, resolved: string[]): PendingPlacemark[] {
  const all = (batchPending as unknown as PendingPlacemark[]) ?? [];
  return all.filter((p) => !resolved.includes(p.name));
}

export async function assignPlacemarkAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve KMZ placemarks.");

  const batchId = formData.get("batchId") as string;
  const placemarkName = formData.get("placemarkName") as string;
  const assetId = formData.get("assetId") as string;
  if (!assetId) return;

  const batch = await prisma.kmzImportBatch.findUniqueOrThrow({ where: { id: batchId } });
  const pending = getPending(batch.pending, batch.resolved);
  const placemark = pending.find((p) => p.name === placemarkName);
  if (!placemark) return;

  await assignPlacemarkToAsset(assetId, placemark.lat, placemark.lon, placemark.name);

  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { assetName: true } });
  await prisma.kmzImportBatch.update({ where: { id: batchId }, data: { resolved: { push: placemarkName } } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "KMZ_PLACEMARK_ASSIGNED",
      entityType: "Asset",
      entityId: assetId,
      newValue: { placemarkName, assetName: asset.assetName, lat: placemark.lat, lon: placemark.lon },
    },
  });

  revalidatePath(`/media/settings/import-kmz/${batchId}`);
}

export async function dismissPlacemarkAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve KMZ placemarks.");

  const batchId = formData.get("batchId") as string;
  const placemarkName = formData.get("placemarkName") as string;

  await prisma.kmzImportBatch.update({ where: { id: batchId }, data: { resolved: { push: placemarkName } } });
  revalidatePath(`/media/settings/import-kmz/${batchId}`);
}

export async function bulkAssignGroupAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve KMZ placemarks.");

  const batchId = formData.get("batchId") as string;
  const prefix = formData.get("prefix") as string;
  const assetId = formData.get("assetId") as string;
  if (!assetId) return;

  const batch = await prisma.kmzImportBatch.findUniqueOrThrow({ where: { id: batchId } });
  const pending = getPending(batch.pending, batch.resolved);
  const group = pending.filter((p) => detectPrefix(p.name) === prefix);
  if (group.length === 0) return;

  // A large group (hundreds of placemarks) assigned one row at a time — each
  // its own awaited round trip — routinely exceeded the serverless function's
  // execution limit and looked like "Assign" simply did nothing. Batched into
  // a handful of queries regardless of group size instead.
  const asset = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    include: { _count: { select: { locations: true } } },
  });

  const toInsert: { assetId: string; label: string; latitude: number; longitude: number }[] = [];
  let remaining = group;

  if (asset.latitude === null && asset._count.locations === 0) {
    const [first, ...rest] = group;
    await prisma.asset.update({ where: { id: assetId }, data: { latitude: first.lat, longitude: first.lon } });
    remaining = rest;
  } else if (asset.latitude !== null && asset._count.locations === 0) {
    toInsert.push({ assetId, label: asset.assetName, latitude: Number(asset.latitude), longitude: Number(asset.longitude) });
  }

  for (const p of remaining) {
    toInsert.push({ assetId, label: p.name, latitude: p.lat, longitude: p.lon });
  }

  if (toInsert.length > 0) {
    await prisma.assetLocation.createMany({ data: toInsert });
  }

  await prisma.kmzImportBatch.update({
    where: { id: batchId },
    data: { resolved: { push: group.map((g) => g.name) } },
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "KMZ_GROUP_ASSIGNED",
      entityType: "Asset",
      entityId: assetId,
      newValue: { prefix, count: group.length, assetName: asset.assetName },
    },
  });

  revalidatePath(`/media/settings/import-kmz/${batchId}`);
}

export async function bulkDismissGroupAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only Admins can resolve KMZ placemarks.");

  const batchId = formData.get("batchId") as string;
  const prefix = formData.get("prefix") as string;

  const batch = await prisma.kmzImportBatch.findUniqueOrThrow({ where: { id: batchId } });
  const pending = getPending(batch.pending, batch.resolved);
  const group = pending.filter((p) => detectPrefix(p.name) === prefix);
  if (group.length === 0) return;

  await prisma.kmzImportBatch.update({
    where: { id: batchId },
    data: { resolved: { push: group.map((g) => g.name) } },
  });

  revalidatePath(`/media/settings/import-kmz/${batchId}`);
}
