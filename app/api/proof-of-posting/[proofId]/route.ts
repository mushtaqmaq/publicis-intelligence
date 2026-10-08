import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { hasSection } from "@/lib/auth/modules";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ proofId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await hasSection(user, "media", "plans"))) return NextResponse.json({ error: "You do not have access to the Media module." }, { status: 403 });

  const { proofId } = await params;
  const proof = await prisma.proofOfPosting.findUnique({ where: { id: proofId } });
  if (!proof) return NextResponse.json({ error: "Proof not found" }, { status: 404 });

  const result = await get(proof.photoUrl, { access: "private" });
  if (!result?.stream) return NextResponse.json({ error: "Image content not found" }, { status: 404 });

  return new NextResponse(result.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
