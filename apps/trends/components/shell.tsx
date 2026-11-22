// The Media page shell, reproduced so Trends reads as the fourth Media tab and not as another product: same sidebar, heading,
// description and tab row, drawn with the existing app's own stylesheet (/styles.css on the same origin). Links to the existing
// app are plain anchors on purpose: next/link would prefix them with /media/trends.
import type { ReactNode } from 'react';
import { House, Compass, Sparkles, Megaphone, Wallet, Clapperboard, Search, Library, Building2, Gauge, CalendarClock, ChartColumn, MapPin, TrendingUp } from 'lucide-react';
import type { Access } from '@/lib/access';

const PILLARS = [['strategy', 'Strategy', Compass, '#2F6BFF'], ['creative', 'Creative', Sparkles, '#E5487A'], ['media', 'Media', Megaphone, '#0EA5A0'], ['finance', 'Finance', Wallet, '#C9971A'], ['production', 'Production', Clapperboard, '#7C5CF5'], ['search', 'Search', Search, '#16A36A']] as const;
const MEDIA_TABS = [['plan', 'Media planner', CalendarClock], ['report', 'Reporting', ChartColumn], ['geo', 'Geo Intelligence', MapPin]] as const;
const item = (href: string, label: string, Icon: typeof House, color?: string, current = false) => (
  <a className="nav-i" href={href} title={label} aria-current={current ? 'page' : undefined} key={href}>
    <span className="t" style={color ? { background: `color-mix(in srgb,${color} 13%,white)`, color } : undefined}><Icon className="ic" aria-hidden /></span><span className="lbl">{label}</span>
  </a>
);

export function Shell({ access, children }: { access: Access; children: ReactNode }) {
  return (
    <div className="shell" id="shell">
      <aside className="sb" aria-label="Navigation">
        <div className="brand"><span className="mark" aria-hidden><svg viewBox="0 0 32 32"><path d="M11 23V9h6.2a4.6 4.6 0 010 9.2H11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="brand-t"><b>Publicis</b> Intelligence</span></div>
        <nav id="nav">
          {item('/#/home', 'Home', House)}
          <div className="nav-h">Pillars</div>
          {PILLARS.map(([id, name, Icon, color]) => item(`/#/p/${id}`, name, Icon, color, id === 'media'))}
          <div className="nav-h">Workspace</div>
          {item('/#/library', 'Library', Library)}{item('/#/clients', 'Clients', Building2)}
          <div className="nav-h">Account</div>
          {item('/#/usage', 'Usage', Gauge)}
        </nav>
        {access.state === 'ok' ? <div className="sb-foot"><div className="who"><span className="avatar">{access.name.slice(0, 1).toUpperCase()}</span><span className="who-t"><b>{access.name}</b></span></div></div> : null}
      </aside>
      <div className="main">
        <header className="top"><p className="crumb"><span style={{ color: '#0EA5A0', display: 'inline-flex' }}><Megaphone className="ic" aria-hidden /></span><span><a href="/#/p/media">Media</a> · Trends &amp; Intelligence</span></p></header>
        <main className="view">
          <header className="ph"><span className="tile" style={{ background: 'color-mix(in srgb,#0EA5A0 12%,white)', color: '#0EA5A0' }}><Megaphone className="ic lg" aria-hidden /></span><div><h1>Media</h1><p>Online, OOH and hybrid media plans, reporting for clients, and geo intelligence for places and OOH sites.</p></div></header>
          <nav className="agents" aria-label="Media tools">
            {MEDIA_TABS.map(([id, name, Icon]) => <a className="agent-b" href={`/#/p/media/${id}`} key={id}><Icon className="ic" aria-hidden />{name}</a>)}
            <a className="agent-b" href="/media/trends" aria-current="page" aria-selected="true"><TrendingUp className="ic" aria-hidden />Trends &amp; Intelligence</a>
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
