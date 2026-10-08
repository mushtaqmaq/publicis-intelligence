import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUserModules } from "./modules";
import { hasPermission } from "./permissions";
import type { SessionUser } from "./session";
import type { FActor } from "@/lib/finance/service";

const isAdmin = (u: { role: string }) => u.role === "SUPER_ADMIN" || u.role === "ADMIN";

// Every /finance page, action and route: signed in AND holds the Finance module (admins hold every module).
// `manager` = an administrator or someone given finance.manage (assigns designers, manages any request).
export async function requireFinanceUser(): Promise<{ user: SessionUser; actor: FActor }> {
  const { getSessionUser } = await import("./session");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await getUserModules(user)).includes("finance")) throw new Error("You do not have access to the Finance module.");
  const manager = isAdmin(user) || (await hasPermission(user, "finance.manage"));
  return { user, actor: { id: user.id, role: user.role, manager } };
}

// People who can be given a request: active users who hold the Finance module (or are admins).
export async function financeStaff(): Promise<{ id: string; name: string | null; email: string }[]> {
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { email: "asc" }, select: { id: true, name: true, email: true, role: true } });
  const out: { id: string; name: string | null; email: string }[] = [];
  for (const u of users) {
    if (isAdmin(u) || (await getUserModules({ id: u.id, email: u.email, name: u.name, role: u.role })).includes("finance")) out.push({ id: u.id, name: u.name, email: u.email });
  }
  return out;
}
export async function assertFinanceStaff(ids: (string | null)[]) {
  const staff = new Set((await financeStaff()).map((s) => s.id));
  for (const id of ids) if (id && !staff.has(id)) throw new Error("That person does not have access to the Finance module.");
}
