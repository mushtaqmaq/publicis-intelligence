'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [['/', 'Radar'], ['/discover', 'Discover'], ['/clients', 'Client intelligence'], ['/idea-lab', 'Idea Lab'], ['/admin/sources', 'Sources']] as const;
// Navigation inside Trends. usePathname gives the path without the /media/trends prefix.
export function LocalNav() {
  const path = usePathname() || '/';
  return (
    <nav className="tr-nav" aria-label="Trends sections">
      {ITEMS.map(([href, label]) => { const on = href === '/' ? path === '/' || path.startsWith('/trends') : path.startsWith(href); return <Link key={href} href={href} aria-current={on ? 'page' : undefined}>{label}</Link>; })}
    </nav>
  );
}
