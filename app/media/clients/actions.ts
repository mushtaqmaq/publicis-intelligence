"use server";

import { requireMediaUser } from "@/lib/auth/modules";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cleanDepartments } from "@/lib/core/clients";
import { prisma } from "@/lib/prisma";

import { requirePermission } from "@/lib/auth/permissions";

export async function assignAccountManagerAction(formData: FormData) {
  const user = await requireMediaUser("clients");
  await requirePermission(user, "clients.manage_all");

  const clientId = formData.get("clientId") as string;
  const accountManagerId = (formData.get("accountManagerId") as string) || null;

  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  await prisma.client.update({ where: { id: clientId }, data: { accountManagerId } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CLIENT_ACCOUNT_MANAGER_ASSIGNED",
      entityType: "Client",
      entityId: clientId,
      oldValue: { accountManagerId: client.accountManagerId },
      newValue: { accountManagerId },
    },
  });

  revalidatePath("/media/clients");
}

// Which departments handle a client (one client record for the whole platform).
export async function setClientDepartmentsAction(formData: FormData) {
  const user = await requireMediaUser("clients");
  await requirePermission(user, "clients.manage_all");
  const clientId = String(formData.get("clientId") ?? "");
  const departments = cleanDepartments(formData.getAll("departments"));
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  await prisma.client.update({ where: { id: clientId }, data: { departments } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CLIENT_DEPARTMENTS_SET", entityType: "Client", entityId: clientId, oldValue: { departments: client.departments }, newValue: { departments } } });
  revalidatePath("/media/clients");
}

export async function createClientAction(formData: FormData) {
  const user = await requireMediaUser("clients");
  await requirePermission(user, "clients.manage_all");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/media/clients?error=" + encodeURIComponent("Enter a client name."));
  if (await prisma.client.findUnique({ where: { name } })) redirect("/media/clients?error=" + encodeURIComponent("That client already exists."));
  const departments = cleanDepartments(formData.getAll("departments"));
  const c = await prisma.client.create({ data: { name, departments } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CLIENT_CREATED", entityType: "Client", entityId: c.id, newValue: { name, departments } } });
  revalidatePath("/media/clients");
  redirect("/media/clients");
}
