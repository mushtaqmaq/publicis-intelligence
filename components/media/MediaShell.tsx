"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, FileStack, Boxes, Map as MapIcon, Building2, Users, Home, Zap, MessageCircle, Compass, Sparkles,
  Megaphone, Wallet, Clapperboard, Search, Library, Gauge, ShieldCheck, LogOut, Menu, BarChart3, Settings, ChevronDown, ChevronRight,
} from "lucide-react";

type U = { name: string | null; email: string; role: string };
type Ico = React.ComponentType<{ size?: number; strokeWidth?: number }>;

// Links back into the single-page app (hash routes), so everything feels like one product.
const platformNav = [
  { href: "/#/home", label: "Home", icon: Home },
  { href: "/#/command", label: "Command", icon: Zap },
  { href: "/#/assistant", label: "Assistant", icon: MessageCircle },
];
// Each pillar is a module. Only the modules a person has are shown (admins have all).
const pillars: { id: string; href: string; label: string; icon: Ico; color: string }[] = [
  { id: "strategy", href: "/#/p/strategy", label: "Strategy", icon: Compass, color: "#2F6BFF" },
  { id: "creative", href: "/#/p/creative", label: "Creative", icon: Sparkles, color: "#E5487A" },
  { id: "media", href: "/#/p/media", label: "Media", icon: Megaphone, color: "#0EA5A0" },
  { id: "finance", href: "/#/p/finance", label: "Finance", icon: Wallet, color: "#C9971A" },
  { id: "multimedia", href: "/#/p/multimedia", label: "Multimedia", icon: Clapperboard, color: "#7C5CFF" },
  { id: "search", href: "/#/p/search", label: "Search", icon: Search, color: "#16A36A" },
];
// The OOH planner lives inside the Media module.
const mediaTools = [
  { section: "dashboard", href: "/media/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "plans", href: "/media/plans", label: "Media plans", icon: FileStack },
  { section: "inventory", href: "/media/inventory", label: "Inventory", icon: Boxes },
  { section: "map", href: "/media/map", label: "Map", icon: MapIcon },
  { section: "suppliers", href: "/media/suppliers", label: "Suppliers", icon: Building2 },
  { section: "reports", href: "/media/reports", label: "Reports", icon: BarChart3 },
  { section: "clients", href: "/media/clients", label: "Client accounts", icon: Users },
];
// Media settings (rate cards, imports, fees, locations ...). Items with a permission are hidden unless granted.
const settingsNav: { href: string; label: string; permission?: string }[] = [
  { href: "/media/settings/rate-cards", label: "Rate cards" },
  { href: "/media/settings/import-rate-card", label: "Import rate card" },
  { href: "/media/settings/import-media-plans", label: "Import media plans" },
  { href: "/media/settings/import-kmz", label: "Import KMZ (locations)" },
  { href: "/media/settings/ooh-enrichment", label: "Asset enrichment review" },
  { href: "/media/settings/rate-versions", label: "Rate versions" },
  { href: "/media/settings/suppliers", label: "Suppliers" },
  { href: "/media/settings/asset-categories", label: "Asset categories" },
  { href: "/media/settings/pricing-rules", label: "Pricing rules" },
  { href: "/media/settings/fees", label: "Fees" },
  { href: "/media/settings/revenue-targets", label: "Revenue targets", permission: "dashboard.revenue.view" },
  { href: "/media/settings/retainer-fees", label: "Retainer fees", permission: "dashboard.revenue.view" },
  { href: "/media/settings/avr-schemes", label: "Supplier AVR schemes", permission: "dashboard.avr.view" },
  { href: "/media/settings/import-history", label: "Import history" },
  { href: "/media/settings/audit-log", label: "Audit log" },
];
const workspace = [
  { href: "/#/library", label: "Library", icon: Library },
  { href: "/#/clients", label: "Clients", icon: Building2 },
  { href: "/#/usage", label: "Usage", icon: Gauge },
];

function Item({ href, label, icon: Icon, active, color, sub }: { href: string; label: string; icon: Ico; active?: boolean; color?: string; sub?: boolean }) {
  const cls = `flex items-center gap-2.5 rounded-xl py-2 text-sm transition-colors ${sub ? "pl-9 pr-3" : "px-3"} ${active ? "bg-white text-foreground shadow-sm ring-1 ring-black/5 font-medium" : "text-[#3c3c43] hover:bg-black/5"}`;
  const icon = color ? (
    <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${color}14`, color }}><Icon size={14} strokeWidth={1.75} /></span>
  ) : <Icon size={sub ? 14 : 16} strokeWidth={1.75} />;
  // Media tools use client-side links; platform links are plain anchors into the static app.
  return href.startsWith("/media") ? <Link href={href} className={cls}>{icon}{label}</Link> : <a href={href} className={cls}>{icon}{label}</a>;
}

function Section({ title }: { title: string }) {
  return <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">{title}</div>;
}

export function MediaShell({ user, permissions, modules, sections, children }: { user: U; permissions: string[]; modules: string[]; sections: string[]; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/media/settings"));
  const permissionSet = new Set(permissions);
  const visibleSettings = settingsNav.filter((i) => !i.permission || permissionSet.has(i.permission));
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const myPillars = pillars.filter((p) => modules.includes(p.id));

  async function signOut() {
    try { await fetch("/api/logout", { method: "POST", headers: { "x-pi": "1" } }); } catch { /* ignore */ }
    window.location.href = "/login";
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {platformNav.map((i) => <Item key={i.href} {...i} />)}
      {myPillars.length > 0 && <Section title="Modules" />}
      {myPillars.map((p) => (
        <div key={p.id}>
          <Item href={p.href} label={p.label} icon={p.icon} color={p.color} active={p.id === "media" && pathname.startsWith("/media")} />
          {p.id === "media" && mediaTools.filter((t) => sections.includes(t.section)).map(({ section: _s, ...t }) => <Item key={t.href} {...t} sub active={pathname === t.href || pathname.startsWith(t.href + "/")} />)}
          {p.id === "media" && sections.includes("settings") && (
            <>
              <button onClick={() => setSettingsOpen((v) => !v)} className="flex w-full items-center gap-2.5 rounded-xl py-2 pl-9 pr-3 text-sm text-[#3c3c43] hover:bg-black/5">
                <Settings size={14} strokeWidth={1.75} />Settings{settingsOpen ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
              </button>
              {settingsOpen && visibleSettings.map((t) => (
                <Link key={t.href} href={t.href} className={`block rounded-lg py-1.5 pl-14 pr-3 text-[13px] ${pathname.startsWith(t.href) ? "bg-white font-medium text-foreground shadow-sm ring-1 ring-black/5" : "text-[#3c3c43] hover:bg-black/5"}`}>{t.label}</Link>
              ))}
            </>
          )}
        </div>
      ))}
      <Section title="Workspace" />
      {workspace.map((i) => <Item key={i.href} {...i} />)}
      {isAdmin ? <Item href="/#/admin" label="Admin" icon={ShieldCheck} /> : null}
    </nav>
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className={`${open ? "fixed inset-y-0 left-0 z-40" : "hidden"} md:static md:flex w-[252px] shrink-0 flex-col border-r border-border bg-[#fafafa]`}>
        <a href="/#/home" className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#111114] text-white font-semibold">P</span>
          <span className="font-serif text-[16px] leading-tight">Publicis <span className="font-normal">Intelligence</span></span>
        </a>
        {nav}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
          <button className="md:hidden" aria-label="Menu" onClick={() => setOpen((v) => !v)}><Menu size={20} /></button>
          <div className="text-sm text-muted hidden md:block">Media</div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="font-medium">{user.name || user.email}</div>
              <div className="text-xs text-muted">{user.role.replace("_", " ").toLowerCase()}</div>
            </div>
            <button onClick={signOut} title="Sign out" className="rounded-lg p-2 text-muted hover:bg-black/5"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
