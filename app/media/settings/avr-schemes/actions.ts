"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { requirePermission } from "@/lib/auth/permissions";
import { parseAvrExcel } from "@/lib/ingestion/parseAvrExcel";

const MAX_SLABS = 6;

function readSlabs(formData: FormData) {
  const slabs: Array<{ thresholdFrom: number; thresholdTo: number | null; rebatePct: number; sortOrder: number }> = [];
  for (let i = 0; i < MAX_SLABS; i++) {
    const from = formData.get(`slabThresholdFrom${i}`);
    const to = formData.get(`slabThresholdTo${i}`);
    const rebatePct = formData.get(`slabRebatePct${i}`);
    if (!from || !rebatePct) continue;
    const f = Number(from);
    const t = to ? Number(to) : null;
    const r = Number(rebatePct);
    if (!Number.isFinite(f) || !Number.isFinite(r) || (t !== null && !Number.isFinite(t))) continue;
    slabs.push({ thresholdFrom: f, thresholdTo: t, rebatePct: r / 100, sortOrder: i });
  }
  slabs.sort((a, b) => a.thresholdFrom - b.thresholdFrom);
  return slabs;
}

export async function createAvrSchemeAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.avr.view");

  const supplierId = formData.get("supplierId") as string;
  const category = ((formData.get("category") as string) || "General").trim();
  const year = Number(formData.get("year"));
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!supplierId || !Number.isFinite(year)) {
    redirect("/media/settings/avr-schemes?error=" + encodeURIComponent("Supplier and year are required."));
  }

  const existing = await prisma.avrScheme.findUnique({ where: { supplierId_category_year: { supplierId, category, year } } });
  if (existing) {
    redirect(
      `/media/settings/avr-schemes/${supplierId}/${year}?error=` +
        encodeURIComponent(`A scheme for this supplier/category/year already exists — edit it instead of re-adding.`)
    );
  }

  const slabs = readSlabs(formData);

  const scheme = await prisma.avrScheme.create({
    data: { supplierId, category, year, notes, slabs: { create: slabs } },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "AVR_SCHEME_CREATED",
      entityType: "AvrScheme",
      entityId: scheme.id,
      newValue: { supplierId, category, year, slabCount: slabs.length },
    },
  });

  revalidatePath("/media/settings/avr-schemes");
  revalidatePath(`/media/settings/avr-schemes/${supplierId}`);
  revalidatePath(`/media/settings/avr-schemes/${supplierId}/${year}`);
  revalidatePath("/media/dashboard");
  redirect(`/media/settings/avr-schemes/${supplierId}/${year}`);
}

// Lets a mistake made during creation or upload (e.g. a scheme attached to
// the wrong supplier) be corrected in place instead of only being
// deletable — including reassigning it to a different supplier.
export async function updateAvrSchemeAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.avr.view");

  const id = formData.get("id") as string;
  const supplierId = formData.get("supplierId") as string;
  const category = ((formData.get("category") as string) || "General").trim();
  const year = Number(formData.get("year"));
  const notes = (formData.get("notes") as string)?.trim() || null;

  const before = await prisma.avrScheme.findUniqueOrThrow({ where: { id }, include: { supplier: { select: { name: true } } } });

  if (!supplierId || !Number.isFinite(year)) {
    redirect(`/media/settings/avr-schemes/${before.supplierId}/${before.year}?error=` + encodeURIComponent("Supplier and year are required."));
  }

  const conflict = await prisma.avrScheme.findUnique({ where: { supplierId_category_year: { supplierId, category, year } } });
  if (conflict && conflict.id !== id) {
    redirect(
      `/media/settings/avr-schemes/${before.supplierId}/${before.year}?error=` +
        encodeURIComponent("Another scheme already exists for that supplier/category/year.")
    );
  }

  const slabs = readSlabs(formData);

  await prisma.$transaction([
    prisma.avrSlab.deleteMany({ where: { avrSchemeId: id } }),
    prisma.avrScheme.update({
      where: { id },
      data: { supplierId, category, year, notes, slabs: { create: slabs } },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "AVR_SCHEME_UPDATED",
      entityType: "AvrScheme",
      entityId: id,
      oldValue: { supplier: before.supplier.name, supplierId: before.supplierId, category: before.category, year: before.year },
      newValue: { supplierId, category, year, slabCount: slabs.length },
    },
  });

  revalidatePath("/media/settings/avr-schemes");
  revalidatePath(`/media/settings/avr-schemes/${before.supplierId}`);
  revalidatePath(`/media/settings/avr-schemes/${before.supplierId}/${before.year}`);
  revalidatePath(`/media/settings/avr-schemes/${supplierId}`);
  revalidatePath(`/media/settings/avr-schemes/${supplierId}/${year}`);
  revalidatePath("/media/dashboard");
  redirect(`/media/settings/avr-schemes/${supplierId}/${year}`);
}

export async function deleteAvrSchemeAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.avr.view");

  const id = formData.get("id") as string;
  const scheme = await prisma.avrScheme.delete({ where: { id }, include: { supplier: { select: { name: true } } } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "AVR_SCHEME_DELETED",
      entityType: "AvrScheme",
      entityId: id,
      oldValue: { supplier: scheme.supplier.name, category: scheme.category, year: scheme.year },
    },
  });

  revalidatePath("/media/settings/avr-schemes");
  revalidatePath(`/media/settings/avr-schemes/${scheme.supplierId}`);
  revalidatePath(`/media/settings/avr-schemes/${scheme.supplierId}/${scheme.year}`);
  revalidatePath("/media/dashboard");
  redirect(`/media/settings/avr-schemes/${scheme.supplierId}/${scheme.year}`);
}

// Real supplier AVR files (e.g. "AVR Elan.xlsx") often bundle several
// category sub-schemes for one supplier in a single sheet — this parses all
// of them and creates whichever don't already exist. Existing
// (supplier, category, year) combinations are left untouched and reported
// as skipped, never silently overwritten. If the wrong supplier is picked,
// use Edit on the resulting scheme card to reassign it — nothing here is
// destructive of other suppliers' data.
export async function importAvrExcelAction(formData: FormData) {
  const user = await requireMediaUser();
  await requirePermission(user, "dashboard.avr.view");

  const supplierId = formData.get("supplierId") as string;
  const file = formData.get("file") as File | null;

  if (!supplierId || !file || file.size === 0) {
    redirect("/media/settings/avr-schemes?error=" + encodeURIComponent("Select a supplier and a file to upload."));
  }

  const buffer = Buffer.from(await file!.arrayBuffer());
  const parsed = parseAvrExcel(buffer);

  if (parsed.length === 0) {
    redirect(
      "/media/settings/avr-schemes?error=" +
        encodeURIComponent(`Couldn't find any category/slab tables in "${file!.name}" — the layout may differ from what this parser expects.`)
    );
  }

  let created = 0;
  const skipped: string[] = [];

  for (const block of parsed) {
    const existing = await prisma.avrScheme.findUnique({
      where: { supplierId_category_year: { supplierId, category: block.category, year: block.year } },
    });
    if (existing) {
      skipped.push(`${block.category} ${block.year}`);
      continue;
    }

    const scheme = await prisma.avrScheme.create({
      data: {
        supplierId,
        category: block.category,
        year: block.year,
        notes: `Imported from ${file!.name}`,
        slabs: {
          create: block.slabs
            .sort((a, b) => a.threshold - b.threshold)
            .map((s, i) => ({ thresholdFrom: s.threshold, thresholdTo: null, rebatePct: s.rebatePct, sortOrder: i })),
        },
      },
    });
    created += 1;

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "AVR_SCHEME_IMPORTED",
        entityType: "AvrScheme",
        entityId: scheme.id,
        newValue: { supplierId, category: block.category, year: block.year, slabCount: block.slabs.length, sourceFile: file!.name },
      },
    });
  }

  revalidatePath("/media/settings/avr-schemes");
  revalidatePath(`/media/settings/avr-schemes/${supplierId}`);
  for (const y of new Set(parsed.map((b) => b.year))) revalidatePath(`/media/settings/avr-schemes/${supplierId}/${y}`);
  revalidatePath("/media/dashboard");

  const notice = `Imported ${created} scheme(s) from "${file!.name}"${skipped.length > 0 ? `; skipped ${skipped.length} already on file (${skipped.join(", ")})` : ""}. Wrong supplier? Use Edit on each card to reassign.`;
  redirect(`/media/settings/avr-schemes/${supplierId}?notice=` + encodeURIComponent(notice));
}
