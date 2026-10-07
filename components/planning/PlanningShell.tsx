"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Boxes, Map as MapIcon, Building2, Users, Home, Zap, MessageCircle, Compass, Sparkles,
  Megaphone, Wallet, Clapperboard, Search, Library, Gauge, ShieldCheck, LogOut, Menu,
} from "lucide-react";

type U = { name: string | null; email: string; role: string };

// Links back into the existing single-page app (hash routes), so planning feels like one product.
const platformNav = [
  { href: "/#/home", label: "Home", icon: Home },
  { href: "/#/command", label: "Command", icon: Zap },
  { href: "/#/assistant", label: "Assistant", icon: MessageCircle },
];
const pillars = [
  { href: "/#/p/strategy", label: "Strategy", icon: Compass, color: "#2F6BFF" },
  { href: "/#/p/creative", label: "Creative", icon: Sparkles, color: "#E5487A" },
  { href: "/#/p/media", label: "Media", icon: Megaphone, color: "#0EA5A0" },
  { href: "/#/p/finance", label: "Finance", icon: Wallet, color: "#C9971A" },
  { href: "/#/p/production", label: "Production", icon: Clapperboard, color: "#7C5CFF" },
  { href: "/#/p/search", label: "Search", icon: Search, color: "#16A36A" },
];
const workspace = [
  { href: "/#/library", label: "Library", icon: Library },
  { href: "/#/clients", label: "Clients", icon: Building2 },
  { href: "/#/usage", label: "Usage", icon: Gauge },
];
const planningNav = [
  { href: "/planning/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/planning/inventory", label: "Inventory", icon: Boxes },
  { href: "/planning/map", label: "Map", icon: MapIcon },
  { href: "/planning/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/planning/clients", label: "Clients", icon: Users },
];

function Item({ href, label, icon: Icon, active, color }: { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; active?: boolean; color?: string }) {
  const cls = `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${active ? "bg-white text-foreground shadow-sm ring-1 ring-black/5 font-medium" : "text-[#3c3c43] hover:bg-black/5"}`;
  const icon = color ? (
    <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${color}14`, color }}><Icon size={14} strokeWidth={1.75} /></span>
  ) : <Icon size={16} strokeWidth={1.75} />;
  // Planning routes use client-side links; platform links are plain anchors into the static SPA.
  return href.startsWith("/planning") ? <Link href={href} className={cls}>{icon}{label}</Link> : <a href={href} className={cls}>{icon}{label}</a>;
}

function Section({ title }: { title: string }) {
  return <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">{title}</div>;
}

export function PlanningShell({ user, permissions, children }: { user: U; permissions: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  void permissions; // reserved for permission-gated items as more planning sections land

  async function signOut() {
    try { await fetch("/api/logout", { method: "POST", headers: { "x-pi": "1" } }); } catch { /* ignore */ }
    window.location.href = "/login";
  }

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {platformNav.map((i) => <Item key={i.href} {...i} />)}
      <Section title="Pillars" />
      {pillars.map((i) => <Item key={i.href} {...i} />)}
      <Section title="OOH Planning" />
      {planningNav.map((i) => <Item key={i.href} {...i} active={pathname === i.href || (pathname ?? "").startsWith(i.href + "/")} />)}
      <Section title="Workspace" />
      {workspace.map((i) => <Item key={i.href} {...i} />)}
      {user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? <Item href="/#/admin" label="Admin" icon={ShieldCheck} /> : null}
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
          <div className="text-sm text-muted hidden md:block">OOH Planning</div>
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
