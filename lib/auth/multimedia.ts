import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUserModules } from "./modules";
import { hasPermission } from "./permissions";
import type { SessionUser } from "./session";
import type { MActor } from "@/lib/multimedia/service";

const isAdmin = (u: { role: string }) => u.role === "SUPER_ADMIN" || u.role === "ADMIN";

// Every /multimedia page, action and route: signed in AND holds the Multimedia module (admins hold every module).
// `manager` = an administrator or someone given multimedia.manage (assigns designers, manages any request).
export async function requireMultimediaUser(): Promise<{ user: SessionUser; actor: MActor }> {
  const { getSessionUser } = await import("./session");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await getUserModules(user)).includes("multimedia")) throw new Error("You do not have access to the Multimedia module.");
  const manager = isAdmin(user) || (await hasPermission(user, "multimedia.manage"));
  return { user, actor: { id: user.id, role: user.role, manager } };
}

// People who can be given a request: active users who hold the Multimedia module (or are admins).
export async function multimediaStaff(): Promise<{ id: string; name: string | null; email: string }[]> {
  const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { email: "asc" }, select: { id: true, name: true, email: true, role: true } });
  const out: { id: string; name: string | null; email: string }[] = [];
  for (const u of users) {
    if (isAdmin(u) || (await getUserModules({ id: u.id, email: u.email, name: u.name, role: u.role })).includes("multimedia")) out.push({ id: u.id, name: u.name, email: u.email });
  }
  return out;
}
export async function assertMultimediaStaff(ids: (string | null)[]) {
  const staff = new Set((await multimediaStaff()).map((s) => s.id));
  for (const id of ids) if (id && !staff.has(id)) throw new Error("That person does not have access to the Multimedia module.");
}
