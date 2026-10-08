import { requireMediaUser } from "@/lib/auth/modules";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { AccountManagerDashboard } from "@/components/dashboard/AccountManagerDashboard";
import { MediaPlannerDashboard } from "@/components/dashboard/MediaPlannerDashboard";
import { PlatformOverviewDashboard } from "@/components/dashboard/PlatformOverviewDashboard";

export const dynamic = "force-dynamic";

// A thin dispatcher — each role's dashboard is its own component, reading
// only the data that role is allowed to see. A role never receives a
// restricted widget with its contents hidden; it simply gets a different
// component tree.
export default async function DashboardPage() {
  const user = await requireMediaUser("dashboard");

  switch (user.role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return <AdminDashboard user={user} />;
    case "ACCOUNT_MANAGER":
      return <AccountManagerDashboard user={user} />;
    case "PLANNER":
      return <MediaPlannerDashboard user={user} />;
    default:
      return <PlatformOverviewDashboard />;
  }
}
