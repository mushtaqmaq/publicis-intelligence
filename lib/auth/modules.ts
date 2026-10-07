import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "./session";
// Shared rules live in lib/modules.js (also used by the API server).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { IDS, permKey, resolveModules } from "@/lib/modules";

export type ModuleId = "strategy" | "creative" | "media" | "finance" | "production" | "search";

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
