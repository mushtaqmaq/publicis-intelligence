import { prisma } from "@/lib/prisma";
import { requirePlatformUser } from "@/lib/auth/platform";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { saveTemplateAction } from "../actions";

const DOC_TYPES = [["CAMPAIGN", "Campaign"]] as const; // finance document types are added as those modules arrive
const ROLES = ["ACCOUNT_MANAGER", "PLANNER", "ADMIN", "SUPER_ADMIN", "VIEWER"];

export default async function ApprovalSettings({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requirePlatformUser({ admin: true });
  const { error, ok } = await searchParams;
  const [templates, people] = await Promise.all([
    prisma.approvalTemplate.findMany({ include: { steps: { orderBy: { stepOrder: "asc" } } } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { email: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="Approval steps" subtitle="Who approves each kind of document, in order. Each step is a named person or a role. Nobody can approve their own request. Changes apply to new requests only." />
      <Banner error={error} ok={ok} />
      {DOC_TYPES.map(([type, label]) => {
        const t = templates.find((x) => x.documentType === type);
        return (
          <form key={type} action={saveTemplateAction} className="mt-6 space-y-3 bg-surface border border-border rounded-lg p-5">
            <input type="hidden" name="documentType" value={type} /><input type="hidden" name="name" value={label} />
            <h2 className="font-medium">{label}</h2>
            {[1, 2, 3, 4].map((i) => {
              const s = t?.steps[i - 1];
              const val = s ? (s.approverUserId ?? `role:${s.approverRole}`) : "";
              return (
                <div key={i} className="grid grid-cols-[2fr_3fr_1fr] gap-2 items-end">
                  <div><label className={labelCls}>Step {i}</label><input name={`label${i}`} defaultValue={s?.label ?? ""} placeholder={i === 1 ? "Manager" : ""} className={field} /></div>
                  <div><label className={labelCls}>Approver</label>
                    <select name={`who${i}`} defaultValue={val} className={field}><option value="">(none)</option>
                      <optgroup label="Person">{people.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}</optgroup>
                      <optgroup label="Anyone with role">{ROLES.map((r) => <option key={r} value={`role:${r}`}>{r.replace("_", " ").toLowerCase()}</option>)}</optgroup>
                    </select></div>
                  <div><label className={labelCls}>From QAR</label><input type="number" min="0" name={`min${i}`} defaultValue={s?.minAmount != null ? String(s.minAmount) : ""} className={field} /></div>
                </div>
              );
            })}
            <p className="text-xs text-muted">Leave a step blank to skip it. &ldquo;From QAR&rdquo; makes a step apply only when the amount reaches that figure.</p>
            <button className="rounded-md bg-foreground px-4 py-1.5 text-sm text-white">Save</button>
          </form>
        );
      })}
    </div>
  );
}
