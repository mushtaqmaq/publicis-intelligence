"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import type { MediaChannel } from "@/generated/prisma/enums";

async function requireAdmin() {
  const user = await requireMediaUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only Admins can manage suppliers.");
  }
  return user;
}

function parseLegacyNames(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDiscountPct(raw: string | null) {
  if (!raw || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n / 100 : null;
}

export async function createSupplierAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const mediaChannel = formData.get("mediaChannel") as MediaChannel;

  if (!name) {
    redirect("/media/settings/suppliers?error=" + encodeURIComponent("Supplier name is required."));
  }

  const existing = await prisma.supplier.findUnique({ where: { name } });
  if (existing) {
    redirect("/media/settings/suppliers?error=" + encodeURIComponent(`A supplier named "${name}" already exists.`));
  }

  const supplier = await prisma.supplier.create({
    data: {
      name,
      mediaChannel,
      legacyNames: parseLegacyNames(formData.get("legacyNames") as string | null),
      contactName: (formData.get("contactName") as string)?.trim() || null,
      contactEmail: (formData.get("contactEmail") as string)?.trim() || null,
      contactPhone: (formData.get("contactPhone") as string)?.trim() || null,
      website: (formData.get("website") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
      defaultDiscountPct: parseDiscountPct(formData.get("defaultDiscountPct") as string | null),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: supplier.id,
      newValue: { name, mediaChannel },
    },
  });

  revalidatePath("/media/settings/suppliers");
  redirect("/media/settings/suppliers?notice=" + encodeURIComponent(`Supplier "${name}" created.`));
}

export async function updateSupplierAction(formData: FormData) {
  const admin = await requireAdmin();
  const supplierId = formData.get("supplierId") as string;
  const current = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });

  const next = {
    name: (formData.get("name") as string)?.trim(),
    mediaChannel: formData.get("mediaChannel") as MediaChannel,
    legacyNames: parseLegacyNames(formData.get("legacyNames") as string | null),
    contactName: (formData.get("contactName") as string)?.trim() || null,
    contactEmail: (formData.get("contactEmail") as string)?.trim() || null,
    contactPhone: (formData.get("contactPhone") as string)?.trim() || null,
    website: (formData.get("website") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    defaultDiscountPct: parseDiscountPct(formData.get("defaultDiscountPct") as string | null),
  };

  if (!next.name) {
    redirect(`/media/settings/suppliers?error=${encodeURIComponent("Supplier name is required.")}`);
  }

  await prisma.supplier.update({ where: { id: supplierId }, data: next });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "SUPPLIER_EDITED",
      entityType: "Supplier",
      entityId: supplierId,
      oldValue: { name: current.name, mediaChannel: current.mediaChannel },
      newValue: { name: next.name, mediaChannel: next.mediaChannel },
    },
  });

  revalidatePath("/media/settings/suppliers");
  redirect("/media/settings/suppliers?notice=" + encodeURIComponent(`Supplier "${next.name}" updated.`));
}

export async function toggleSupplierActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const supplierId = formData.get("supplierId") as string;
  const target = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });

  await prisma.supplier.update({ where: { id: supplierId }, data: { isActive: !target.isActive } });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: target.isActive ? "SUPPLIER_DEACTIVATED" : "SUPPLIER_REACTIVATED",
      entityType: "Supplier",
      entityId: supplierId,
      oldValue: { isActive: target.isActive },
      newValue: { isActive: !target.isActive },
    },
  });

  revalidatePath("/media/settings/suppliers");
}
