import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { hasModule, getUserSections } from "@/lib/auth/modules";

/**
 * Streams an asset photo from the (private) Blob store.
 *
 * Asset photos live in the same private store as rate-card PDFs — there's
 * no separate public store (a second one was provisioned by mistake and
 * left disconnected/unused rather than a token being force-shared). This
 * route is the trade-off: one extra server hop per image instead of a
 * second store, in exchange for keeping a single BLOB_READ_WRITE_TOKEN and
 * never exposing the raw Blob URL to the client.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasModule(user, "media"))) return NextResponse.json({ error: "You do not have access to the Media module." }, { status: 403 });
  // Photos appear in inventory, plans, the map and suppliers; anyone with at least one of those may load them.
  const mine = await getUserSections(user, "media");
  if (!["inventory", "plans", "map", "suppliers", "settings"].some((x) => mine.includes(x))) return NextResponse.json({ error: "You do not have access to this section." }, { status: 403 });

  const { imageId } = await params;

  const image = await prisma.assetImage.findUnique({ where: { id: imageId } });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const result = await get(image.url, { access: "private" });
  if (!result || !result.stream) {
    return NextResponse.json({ error: "Image content not found" }, { status: 404 });
  }

  return new NextResponse(result.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
