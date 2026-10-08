import { prisma } from "@/lib/prisma";
import { requirePlatformUser } from "@/lib/auth/platform";
import { myPendingApprovals } from "@/lib/core/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field } from "@/components/platform/Banner";
import { cancelAction, decideAction } from "./actions";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requirePlatformUser();
  const { error, ok } = await searchParams;
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN";
  const [waiting, mine] = await Promise.all([
    myPendingApprovals({ id: user.id, role: user.role }),
    prisma.approvalRequest.findMany({ where: { requestedById: user.id }, orderBy: { createdAt: "desc" }, take: 50, include: { steps: { orderBy: { stepOrder: "asc" } } } }),
  ]);
  const versionIds = [...waiting, ...mine].filter((r) => r.documentType === "CREATIVE_VERSION").map((r) => r.documentId);
  const versions = await prisma.creativeVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, requestId: true, url: true } });
  const mmIds = [...waiting, ...mine].filter((r) => r.documentType === "MULTIMEDIA_VERSION").map((r) => r.documentId);
  const mmVersions = await prisma.multimediaVersion.findMany({ where: { id: { in: mmIds } }, select: { id: true, jobId: true } });
  const link = (t: string, id: string) => ["QUOTATION", "PURCHASE_ORDER", "BILL"].includes(t) ? `/finance/documents/${id}` : t === "MULTIMEDIA_VERSION" ? (mmVersions.find((v) => v.id === id) ? `/multimedia/${mmVersions.find((v) => v.id === id)!.jobId}` : null) : (t === "CAMPAIGN" ? `/campaigns/${id}` : t === "CREATIVE_VERSION" ? (versions.find((v) => v.id === id) ? `/creative/${versions.find((v) => v.id === id)!.requestId}` : null) : null);
  return (
    <div className="p-8 max-w-4xl">
      <PageHeader title="Approvals" subtitle="Requests waiting for you, and the ones you asked for." actions={isAdmin ? <a href="/approvals/settings" className="text-sm text-accent underline">Set approvers</a> : undefined} />
      <Banner error={error} ok={ok} />
      <h2 className="mt-6 font-medium">Waiting for you</h2>
      <div className="mt-2 space-y-3">
        {waiting.map((r) => {
          const cur = r.steps.find((s) => s.status === "PENDING");
          const href = link(r.documentType, r.documentId);
          return (
            <div key={r.id} className="bg-surface border border-border rounded-lg p-4 text-sm">
              <div className="font-medium">{href ? <a href={href} className="text-accent">{r.title}</a> : r.title}</div>
              <div className="text-muted">{r.documentType.toLowerCase().replace("_", " ")} · step {cur?.stepOrder} of {r.steps.length}: {cur?.label}{r.amount != null ? ` · QAR ${Number(r.amount).toLocaleString()}` : ""}</div>
              <form action={decideAction} className="mt-2 flex gap-2 items-center">
                <input type="hidden" name="requestId" value={r.id} />
                <input name="comment" placeholder="Comment (required to reject)" className={field} />
                <button name="action" value="APPROVE" className="rounded-md bg-foreground px-3 py-1.5 text-white">Approve</button>
                <button name="action" value="REJECT" className="rounded-md border border-border px-3 py-1.5">Reject</button>
              </form>
            </div>
          );
        })}
        {waiting.length === 0 && <p className="text-sm text-muted">Nothing is waiting for you.</p>}
      </div>
      <h2 className="mt-8 font-medium">Your requests</h2>
      <div className="mt-2 space-y-3">
        {mine.map((r) => (
          <div key={r.id} className="bg-surface border border-border rounded-lg p-4 text-sm">
            <div className="font-medium">{r.title} <span className="text-muted font-normal">· {r.status.toLowerCase()}</span></div>
            <ol className="text-muted">{r.steps.map((s) => <li key={s.id}>{s.stepOrder}. {s.label}: {s.status.toLowerCase()}{s.comment ? ` (${s.comment})` : ""}</li>)}</ol>
            {r.status === "PENDING" && <form action={cancelAction} className="mt-2"><input type="hidden" name="requestId" value={r.id} /><button className="text-xs text-muted underline">Cancel request</button></form>}
          </div>
        ))}
        {mine.length === 0 && <p className="text-sm text-muted">You have not asked for any approvals.</p>}
      </div>
    </div>
  );
}
