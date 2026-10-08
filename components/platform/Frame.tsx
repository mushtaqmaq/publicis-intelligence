import { redirect } from "next/navigation";
import { Inter, Inter_Tight } from "next/font/google";
import { getSessionUser } from "@/lib/auth/session";
import { getUserPermissions } from "@/lib/auth/permissions";
import { getUserModules, getUserSections } from "@/lib/auth/modules";
import { MediaShell } from "@/components/media/MediaShell";
import "@/app/media/media.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-base" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-serif-display", weight: ["500", "600", "700"] });

// The shared page frame (sidebar, header) for cross-module pages such as /campaigns and /approvals.
export async function Frame({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [permissions, modules, sections] = await Promise.all([getUserPermissions(user.id, user.role), getUserModules(user), getUserSections(user, "media")]);
  return (
    <div className={`${sans.variable} ${display.variable} media-root h-screen w-full`}>
      <MediaShell user={user} permissions={Array.from(permissions)} modules={modules} sections={sections}>{children}</MediaShell>
    </div>
  );
}
