import { redirect } from "next/navigation";
import { Inter, Inter_Tight } from "next/font/google";
import { getSessionUser } from "@/lib/auth/session";
import { getUserPermissions } from "@/lib/auth/permissions";
import { PlanningShell } from "@/components/planning/PlanningShell";
import "./planning.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-base" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-serif-display", weight: ["500", "600", "700"] });

export const dynamic = "force-dynamic";

// Every /planning page requires the platform login (the shared pi_session cookie).
export default async function PlanningLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const permissions = await getUserPermissions(user.id, user.role);

  return (
    <div className={`${sans.variable} ${display.variable} planning-root h-screen w-full`}>
      <PlanningShell user={user} permissions={Array.from(permissions)}>
        {children}
      </PlanningShell>
    </div>
  );
}
