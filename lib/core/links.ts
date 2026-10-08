// The platform stores LINKS to files that live in the company's own cloud or local storage, never the files.
export const LINK_KINDS = ["BRIEF", "REFERENCE", "ARTWORK", "FOOTAGE", "DELIVERABLE", "OTHER"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

// Records a link may be attached to. Add a type here when a module starts using links.
export const LINKABLE_TYPES = ["Campaign", "Deliverable", "CreativeRequest", "MultimediaJob"] as const;
export type LinkableType = (typeof LINKABLE_TYPES)[number];

const MAX_URL = 2000;

// Accepts http(s) URLs only (no javascript:, data:, file:), without embedded credentials. Returns the normalised URL.
export function validateLinkUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a link." };
  if (raw.length > MAX_URL) return { ok: false, error: "That link is too long." };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, error: "That is not a valid link. Start it with https://" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Only http and https links are allowed." };
  if (u.username || u.password) return { ok: false, error: "Links must not contain a username or password." };
  if (!u.hostname) return { ok: false, error: "That is not a valid link." };
  return { ok: true, url: u.toString() };
}

export function isLinkKind(x: string): x is LinkKind { return (LINK_KINDS as readonly string[]).includes(x); }
export function isLinkable(x: string): x is LinkableType { return (LINKABLE_TYPES as readonly string[]).includes(x); }
