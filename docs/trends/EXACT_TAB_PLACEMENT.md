# Exact Media tab placement (approved UI reference)

## Reference screen
Existing Publicis Intelligence URL: `https://publicis-intelligence.vercel.app/#/p/media`.

The screenshot shows the **Media** heading and the horizontal segmented navigation bar directly below the Media description. Its current order is:

`Media planner | Reporting | Geo Intelligence`

**Required order after this feature:**

`Media planner | Reporting | Geo Intelligence | Trends & Intelligence`

The new **Trends & Intelligence** tab must be the **fourth tab, immediately after Geo Intelligence**, in the same horizontal tab row, using the same height, pill radius, spacing, hover, active, focus, responsive behavior, and typography. Do not create a new main sidebar navigation item, a new pillar, an extra card below the tabs, or a tab elsewhere.

## Click and content behavior

- Clicking the fourth tab displays the Trends dashboard in the **main Media content panel** beneath the tabs. Keep the Media heading, description, sidebar, and tab row visibly unchanged. The active tab becomes `Trends & Intelligence`.
- Global coverage remains, with Qatar / GCC / MENA filters within the Trends tab. Other department categories appear within the dashboard, not as sibling main tabs.
- Preserve the first three tabs, their state and navigation, the Media planner's brief and planning functionality, Reporting, and Geo Intelligence.
- If the Trends implementation runs as a separate Next.js service, preserve an integrated experience and selected-tab state on navigation. The canonical server route may be `/media/trends`, but its header/layout must reproduce the Media shell and four-tab bar; show the Trends content immediately below the bar. No obvious separate product experience, popup, or iframe. The user should be able to return to the other three tabs without confusion.
- Consider a Media-specific hash entry `/#/p/media/trends` only if that matches the existing router's tab-state semantics. Do not incorrectly register the tab as an AI agent. Deep links and reload must restore Trends selection.
- On narrow screens, the tab row may scroll horizontally; it must not overlap or hide Geo Intelligence or Trends & Intelligence.

## UI acceptance test

1. Navigate to `/#/p/media`; the original Media landing page loads.
2. Verify the tab order: Media planner -> Reporting -> Geo Intelligence -> Trends & Intelligence.
3. Select each original tab; verify functionality is unchanged.
4. Select Trends & Intelligence; verify only the content area changes and the Media page shell remains consistent.
5. Reload, navigate Back/Forward, and open a deep link; Trends selection/content are restored appropriately.
6. Test keyboard navigation, desktop layout, mobile horizontal scrolling, Media capability checks, and feature-flag rollback.

**This file supersedes any generic reference to placing a Trends "card" or inserting it beside Media AI agents elsewhere in the project documentation.**
