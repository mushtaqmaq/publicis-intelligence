# Media module integration: Global Trends & Intelligence

**Status:** Implementation guide, not a deployed change. **Parent application:** `https://publicis-intelligence.vercel.app/#/p/media`.

## Product placement

The new feature must appear **inside Media**, not in the main sidebar, Home as another pillar, or an external product list:

```
Publicis Intelligence / Media
  [Media planner]  [Reporting]  [Geo Intelligence]  [Trends & Intelligence (NEW)]
                                               immediately after Geo Intelligence

  Media heading, description, sidebar, and four-tab row remain in place.
  Selecting Trends displays its dashboard below this tab row.
```

Audience coverage can still span Strategy, Creative, Social, PR and Client Service; the navigation owner is Media.

## Verified existing application facts

Deployment inspection established a static JS SPA in `public/`, an API in `server.js` behind `api/index.js`, existing Media pillar routing based on `/#/p/media`, and a separate Neon Postgres database. It is **not** currently a Next.js app. Review checked-out code before editing because deployed and local versions may diverge. Keep existing Neon database, Media Planner, and user sessions intact.

## Path and rendering contract

1. Insert **`Trends & Intelligence` as the FOURTH tab immediately after `Geo Intelligence`** in the existing Media tab bar on `/#/p/media`. The precise visible order is `Media planner | Reporting | Geo Intelligence | Trends & Intelligence`. No global navigation addition, no extra card.
2. The anchor must lead to **`/media/trends` on the same domain and same browser tab**.
3. If `/#/p/media/trends` is implemented as a transition route, it must be intercepted before the SPA's generic `p/<pillar>/<agent>` route; do not register it as an agent.
4. The new Next.js service has `basePath: '/media/trends'`. Logical `/discover` becomes public `/media/trends/discover`, and API `/api/v1/trends` becomes public `/media/trends/api/v1/trends`.
5. Preserve the **existing Media heading, description, sidebar and tab strip** while Trends is active. Render Trends in the existing Media main content area beneath the tabs; match selected-pill styling, spacing, keyboard behavior, responsive scrolling, typography, and nav hierarchy. A Next.js-proxied route must reproduce this Media shell and selected-tab state, with clear navigation to the other three tabs.
6. No iframe and no new-tab popup. Do not allow normal navigation to show the upstream `.vercel.app` host.

## Next.js subpath configuration

In the new Next.js app, with a verified compatible Next.js version:

```ts
// apps/trends/next.config.ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { basePath: '/media/trends' };
export default nextConfig;
```

Next.js automatically prefixes `next/link` routing, but **manual `fetch` URLs, static asset paths and redirect callback URLs must be tested and adjusted**. The base path is compiled into the build, so use a stable prefix in every environment.

## Host Vercel routing (proposed, not applied)

In the existing app's `vercel.json` add **two narrowly scoped rules** before generic rewrites. Substitute the actual tested upstream deployment hostname; do not deploy placeholders:

```json
{
  "rewrites": [
    {
      "source": "/media/trends",
      "destination": "https://REPLACE-WITH-TRENDS-UPSTREAM.vercel.app/media/trends"
    },
    {
      "source": "/media/trends/:path*",
      "destination": "https://REPLACE-WITH-TRENDS-UPSTREAM.vercel.app/media/trends/:path*"
    },
    { "source": "/api/:path*", "destination": "/api/index.js" },
    { "source": "/files/:path*", "destination": "/api/index.js" },
    { "source": "/login", "destination": "/login.html" }
  ]
}
```

This is a **rewrite excerpt**, not a replacement `vercel.json`: preserve existing project-specific `functions`, `outputDirectory`, build/install config, and all other rules. Test in preview first; don't publish rewrite until the upstream service has a stable URL and passes tests. Vercel config ordering and rewrite compatibility must be verified in actual deployment.

## Authentication decision required before agency-wide rollout

The current app has its own login and sessions; the new workspace uses Supabase Auth and RLS. **Same-origin routing does not create SSO**. Allowed MVP: pilot users invited to Supabase with separate login (clearly labeled pilot). For broad production use, introduce agency-approved IdP SSO or a separately reviewed backend-mediated one-time identity exchange, with account linking, session revocation, Media capability enforcement, and cross-client RLS. Never copy passwords/hashes or send secret/service keys to the client. Do not allow the Next.js app to infer Media permission from navigation visibility alone.

## Smoke tests to require before merge

| Test | Expected |
|---|---|
| Open `/#/p/media` | Original Media page and agents still render |
| Click fourth Trends tab after Geo Intelligence | Trends content appears below the existing Media tab row with Trends selected; URL can transition same-tab to `/media/trends` |
| Refresh `/media/trends/discover` | 200 and correct view, no blank SPA fallback |
| Load CSS/JS and image routes | Assets resolve within `/media/trends` prefix |
| Request `/media/trends/api/v1/trends` | Authenticated correctly, no collision with existing `/api/*` |
| Back to Media | Returns to `/#/p/media` |
| Unauthorized direct deep link | Denied server-side, not just hidden in the UI |
| Original three tabs | `Media planner`, `Reporting`, `Geo Intelligence` still render and operate in their original positions |
| Legacy Media Planner | All previously working flows and exports remain available |
| Client confidential trend brief | Only authorized client members can read it |
| Disable feature flag / rollback rewrite | Existing Media unchanged; no destructive data mutation |

## Implementation order

P0 repo audit and access; P1 build Next.js UI under basePath; P2 Supabase + RLS; P3 permitted sources + ingestion; P4 AI + grounded scoring; P5 mount via same-origin preview rewrite and Media-only card; P6 enterprise authentication parity, regression tests, accessibility, monitoring, production approval.

See `EXACT_TAB_PLACEMENT.md` for the screenshot-anchored placement contract and UI acceptance tests.

## Supporting documentation

- https://vercel.com/docs/routing/rewrites
- https://vercel.com/kb/guide/how-can-i-serve-multiple-projects-under-a-single-domain
- https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath
