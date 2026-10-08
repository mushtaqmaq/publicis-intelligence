import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getUserSections } from "@/lib/auth/modules";

// Send people to the first Media section they may open (dashboard for most).
export default async function PlanningHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const mine = await getUserSections(user, "media");
  const first = ["dashboard", "plans", "inventory", "map", "suppliers", "reports", "clients", "settings"].find((x) => mine.includes(x));
  redirect(first ? `/media/${first === "settings" ? "settings/rate-cards" : first}` : "/media/no-access");
}
