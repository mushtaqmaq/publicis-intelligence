// One access check per request, shared by the layout and every page. Each page must call allowed() itself: a layout that
// simply does not show its children does NOT stop Next.js from rendering the page and sending it to the browser.
import { cache } from 'react';
import { headers } from 'next/headers';
import { checkAccess, mayView } from './access';

export const access = cache(async () => checkAccess((await headers()).get('cookie')));
export const allowed = async () => mayView(await access());
