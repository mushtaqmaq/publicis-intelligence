import "server-only";
import { redirect } from "next/navigation";
import { getUserModules } from "./modules";
import type { SessionUser } from "./session";

// Campaigns and approvals belong to no single module: anyone who holds at least one working module
// (or is an admin) can use them. Pages, actions and routes under /campaigns and /approvals call this.
// admin=true additionally requires an administrator (approval templates).
export async function requirePlatformUser(opts: { admin?: boolean } = {}): Promise<SessionUser> {
  const { getSessionUser } = await import("./session");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  if (opts.admin && !isAdmin) throw new Error("Only an administrator can do this.");
  if (!isAdmin) {
    const mods = await getUserModules(user);
    if (!["media", "creative", "multimedia", "finance"].some((m) => mods.includes(m))) throw new Error("You do not have access to campaigns.");
  }
  return user;
}
