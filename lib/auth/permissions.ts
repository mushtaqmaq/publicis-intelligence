import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "./session";

// A role's access is the union of its RolePermission defaults; a
// UserPermissionOverride (granted=true adds, granted=false revokes) always
// wins over the role default for that one user. This is the single source
// of truth checked server-side — a hidden nav link is never access control
// on its own, so every sensitive page/action calls hasPermission/
// requirePermission before running its query, not just before rendering UI.
export async function getUserPermissions(userId: string, role: SessionUser["role"]): Promise<Set<string>> {
  const [roleGrants, overrides] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role }, select: { permission: { select: { key: true } } } }),
    prisma.userPermissionOverride.findMany({ where: { userId }, select: { granted: true, permission: { select: { key: true } } } }),
  ]);

  const keys = new Set(roleGrants.map((r) => r.permission.key));
  for (const o of overrides) {
    if (o.granted) keys.add(o.permission.key);
    else keys.delete(o.permission.key);
  }
  return keys;
}

export async function hasPermission(user: SessionUser, key: string): Promise<boolean> {
  const permissions = await getUserPermissions(user.id, user.role);
  return permissions.has(key);
}

export async function requirePermission(user: SessionUser, key: string): Promise<void> {
  if (!(await hasPermission(user, key))) {
    throw new Error(`Missing required permission: ${key}`);
  }
}
