import { redirect } from "next/navigation";
import { Inter, Inter_Tight } from "next/font/google";
import { getSessionUser } from "@/lib/auth/session";
import { getUserPermissions } from "@/lib/auth/permissions";
import { getUserModules, getUserSections } from "@/lib/auth/modules";
import { MediaShell } from "@/components/media/MediaShell";
import "./media.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-base" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-serif-display", weight: ["500", "600", "700"] });

export const dynamic = "force-dynamic";

// Every /media page needs the platform login AND the Media module (admins have every module).
export default async function MediaLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [permissions, modules, sections] = await Promise.all([getUserPermissions(user.id, user.role), getUserModules(user), getUserSections(user, "media")]);
  const allowed = modules.includes("media");

  return (
    <div className={`${sans.variable} ${display.variable} media-root h-screen w-full`}>
      <MediaShell user={user} permissions={Array.from(permissions)} modules={modules} sections={sections}>
        {allowed ? children : (
          <div className="mx-auto max-w-xl p-10">
            <h1 className="font-serif text-2xl">Media module</h1>
            <p className="mt-2 text-sm text-muted">You do not have access to the Media module. Ask an admin to add it to your account.</p>
            <a href="/#/home" className="mt-4 inline-block text-sm text-accent">Back to Home</a>
          </div>
        )}
      </MediaShell>
    </div>
  );
}
