import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Shell } from '@/components/shell';
import { LocalNav } from '@/components/local-nav';
import { checkAccess, mayView } from '@/lib/access';
import './trends.css';

export const metadata: Metadata = { title: 'Media · Trends & Intelligence · Publicis Intelligence' };
export const dynamic = 'force-dynamic';   // access is checked per request; nothing here may be cached across users

export default async function RootLayout({ children }: { children: ReactNode }) {
  const access = await checkAccess((await headers()).get('cookie'));
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* The existing app's stylesheet, from the same origin, so the Media shell is identical and stays in step with it. */}
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <Shell access={access}>
          {mayView(access) ? (<>
            {access.state === 'unverified' ? <p className="tr-note" role="status">Local preview: {access.reason}</p> : null}
            <LocalNav />
            {children}
          </>) : access.state === 'signed-out' ? (
            <div className="empty"><b>Sign in to open Trends &amp; Intelligence</b><p>Use your Publicis Intelligence login, then come back to this tab.</p><a className="btn pri" href="/login">Sign in</a></div>
          ) : access.state === 'forbidden' ? (
            <div className="empty"><b>You do not have access to Media</b><p>Ask an administrator to give you a Media tool.</p><a className="btn" href="/#/home">Back to Home</a></div>
          ) : (
            <div className="empty"><b>Access could not be checked</b><p>{'reason' in access ? access.reason : ''} Nothing is shown until it can be.</p><a className="btn" href="/#/p/media">Back to Media</a></div>
          )}
        </Shell>
      </body>
    </html>
  );
}
