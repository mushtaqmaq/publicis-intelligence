import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "./session";
// Shared rules live in lib/modules.js (also used by the API server).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { IDS, permKey, resolveModules, resolveSections, sectionIds, SECTION_KEYS } from "@/lib/modules";

export type ModuleId = "strategy" | "creative" | "media" | "finance" | "multimedia" | "search";

// The modules this user may open: admins get all, everyone else only what was granted to them.
export async function getUserModules(user: SessionUser): Promise<string[]> {
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return IDS.slice();
  const [roleGrants, overrides] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role: user.role, permission: { key: { startsWith: "module." } } }, select: { permission: { select: { key: true } } } }),
    prisma.userPermissionOverride.findMany({ where: { userId: user.id, permission: { key: { startsWith: "module." } } }, select: { granted: true, permission: { select: { key: true } } } }),
  ]);
  return resolveModules(user.role, roleGrants.map((r) => r.permission.key), overrides.map((o) => ({ key: o.permission.key, granted: o.granted })));
}

export async function hasModule(user: SessionUser, id: ModuleId): Promise<boolean> {
  return (await getUserModules(user)).includes(id);
}

export { permKey };

export type MediaSection = "dashboard" | "plans" | "inventory" | "map" | "suppliers" | "reports" | "clients" | "settings";

// The sections of a module this user may use (admins: all; others: the module's sections minus any switched off for them).
export async function getUserSections(user: SessionUser, mod: ModuleId): Promise<string[]> {
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return sectionIds(mod);
  const [modules, overrides] = await Promise.all([
    getUserModules(user),
    prisma.userPermissionOverride.findMany({ where: { userId: user.id, permission: { key: { in: SECTION_KEYS } } }, select: { granted: true, permission: { select: { key: true } } } }),
  ]);
  return resolveSections(user.role, modules, mod, overrides.map((o) => ({ key: o.permission.key, granted: o.granted })));
}

export async function hasSection(user: SessionUser, mod: ModuleId, section: string): Promise<boolean> {
  return (await getUserSections(user, mod)).includes(section);
}

// For server actions and route handlers under /media: the signed-in user MUST hold the Media module AND the
// section the file belongs to (pass null only for pages that belong to no section, e.g. the no-access page).
// (Pages are guarded by the layout, but actions and routes are separate endpoints.)
export async function requireMediaUser(section: MediaSection | null): Promise<SessionUser> {
  const { getSessionUser } = await import("./session");
  const user = await getSessionUser();
  // Signed out: send them to the login page (no error), whether this runs in a page or a server action.
  if (!user) redirect("/login");
  if (!(await hasModule(user, "media"))) throw new Error("You do not have access to the Media module.");
  if (section && !(await hasSection(user, "media", section))) redirect("/media/no-access");
  return user;
}
