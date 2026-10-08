"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";

async function requireAdmin() {
  const user = await requireMediaUser("settings");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only Admins can manage asset categories.");
  }
  return user;
}

export async function updateAssetCategoryAction(formData: FormData) {
  const user = await requireMediaUser("settings");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new Error("Only Admins can recategorize assets.");
  }

  const assetId = formData.get("assetId") as string;
  const mediaCategoryId = formData.get("mediaCategoryId") as string;
  const returnTo = (formData.get("returnTo") as string) || "/media/settings/asset-categories";

  const current = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (current.mediaCategoryId === mediaCategoryId) return;

  await prisma.asset.update({ where: { id: assetId }, data: { mediaCategoryId } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ASSET_CATEGORY_CHANGED",
      entityType: "Asset",
      entityId: assetId,
      oldValue: { mediaCategoryId: current.mediaCategoryId },
      newValue: { mediaCategoryId },
    },
  });

  revalidatePath(returnTo);
}

export async function createCategoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    redirect("/media/settings/asset-categories?error=" + encodeURIComponent("Category name is required."));
  }

  const existing = await prisma.assetCategory.findUnique({ where: { name } });
  if (existing) {
    redirect("/media/settings/asset-categories?error=" + encodeURIComponent(`A category named "${name}" already exists.`));
  }

  const maxSort = await prisma.assetCategory.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.assetCategory.create({
    data: { name, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ASSET_CATEGORY_CREATED",
      entityType: "AssetCategory",
      entityId: category.id,
      newValue: { name },
    },
  });

  revalidatePath("/media/settings/asset-categories");
  redirect("/media/settings/asset-categories?notice=" + encodeURIComponent(`Category "${name}" created.`));
}

export async function renameCategoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const categoryId = formData.get("categoryId") as string;
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    redirect("/media/settings/asset-categories?error=" + encodeURIComponent("Category name is required."));
  }

  const current = await prisma.assetCategory.findUniqueOrThrow({ where: { id: categoryId } });
  const existing = await prisma.assetCategory.findUnique({ where: { name } });
  if (existing && existing.id !== categoryId) {
    redirect("/media/settings/asset-categories?error=" + encodeURIComponent(`A category named "${name}" already exists.`));
  }

  await prisma.assetCategory.update({ where: { id: categoryId }, data: { name } });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ASSET_CATEGORY_RENAMED",
      entityType: "AssetCategory",
      entityId: categoryId,
      oldValue: { name: current.name },
      newValue: { name },
    },
  });

  revalidatePath("/media/settings/asset-categories");
  redirect("/media/settings/asset-categories?notice=" + encodeURIComponent(`Category renamed to "${name}".`));
}

export async function toggleCategoryActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const categoryId = formData.get("categoryId") as string;
  const current = await prisma.assetCategory.findUniqueOrThrow({ where: { id: categoryId } });

  await prisma.assetCategory.update({ where: { id: categoryId }, data: { isActive: !current.isActive } });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: current.isActive ? "ASSET_CATEGORY_DEACTIVATED" : "ASSET_CATEGORY_REACTIVATED",
      entityType: "AssetCategory",
      entityId: categoryId,
      oldValue: { isActive: current.isActive },
      newValue: { isActive: !current.isActive },
    },
  });

  revalidatePath("/media/settings/asset-categories");
}

export async function deleteCategoryAction(formData: FormData) {
  const admin = await requireAdmin();
  const categoryId = formData.get("categoryId") as string;

  const category = await prisma.assetCategory.findUniqueOrThrow({
    where: { id: categoryId },
    include: { _count: { select: { assets: true } } },
  });

  if (category._count.assets > 0) {
    redirect(
      "/media/settings/asset-categories?error=" +
        encodeURIComponent(
          `"${category.name}" is still used by ${category._count.assets} asset(s) — reassign them first, or deactivate the category instead of deleting it.`
        )
    );
  }

  await prisma.assetCategory.delete({ where: { id: categoryId } });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "ASSET_CATEGORY_DELETED",
      entityType: "AssetCategory",
      entityId: categoryId,
      oldValue: { name: category.name },
    },
  });

  revalidatePath("/media/settings/asset-categories");
  redirect("/media/settings/asset-categories?notice=" + encodeURIComponent(`Category "${category.name}" deleted.`));
}
