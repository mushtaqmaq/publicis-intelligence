import { field, labelCls } from "@/components/platform/Banner";

type Opt = { id: string; name: string };
type Line = { description: string; quantity: unknown; unitPrice: unknown };
export type DocFormValues = { clientId?: string | null; supplierId?: string | null; campaignId?: string | null; reference?: string | null; issueDate?: Date | null; dueDate?: Date | null; validUntil?: Date | null; taxRatePct?: unknown; notes?: string | null; lines?: Line[] };
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
export const LINE_ROWS = 10;

// Shared by "new" and "edit draft": party, campaign, reference, dates, tax and up to 10 lines (blank rows are ignored).
export function DocForm({ type, action, values = {}, clients, suppliers, campaigns, id, submitLabel }: { type: string; action: (f: FormData) => Promise<void>; values?: DocFormValues; clients: Opt[]; suppliers: Opt[]; campaigns: Opt[]; id?: string; submitLabel: string }) {
  const clientSide = type === "QUOTATION" || type === "BOOKING_ORDER" || type === "INVOICE";
  const refLabel = type === "BOOKING_ORDER" ? "Client LPO / order reference" : type === "BILL" ? "Supplier invoice number" : "Reference";
  return (
    <form action={action} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
      <input type="hidden" name="type" value={type} />{id && <input type="hidden" name="id" value={id} />}
      <div className="grid grid-cols-3 gap-4">
        {clientSide
          ? <div><label className={labelCls}>Client</label><select name="clientId" required defaultValue={values.clientId ?? ""} className={field}><option value="">Choose</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          : <div><label className={labelCls}>Supplier</label><select name="supplierId" required defaultValue={values.supplierId ?? ""} className={field}><option value="">Choose</option>{suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <div><label className={labelCls}>Campaign (optional)</label><select name="campaignId" defaultValue={values.campaignId ?? ""} className={field}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className={labelCls}>{refLabel}</label><input name="reference" defaultValue={values.reference ?? ""} maxLength={120} className={field} /></div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {(type === "INVOICE" || type === "BILL") && <><div><label className={labelCls}>Issue date</label><input type="date" name="issueDate" defaultValue={day(values.issueDate)} className={field} /></div>
          <div><label className={labelCls}>Due date</label><input type="date" name="dueDate" defaultValue={day(values.dueDate)} className={field} /></div></>}
        {type === "QUOTATION" && <div><label className={labelCls}>Valid until</label><input type="date" name="validUntil" defaultValue={day(values.validUntil)} className={field} /></div>}
        <div><label className={labelCls}>Tax %</label><input type="number" step="0.001" min="0" max="100" name="taxRatePct" defaultValue={values.taxRatePct != null ? String(values.taxRatePct) : "0"} className={field} /></div>
      </div>
      <div>
        <div className="grid grid-cols-[3fr_1fr_1fr] gap-2 text-xs text-muted uppercase tracking-wide mb-1"><span>Description</span><span>Quantity</span><span>Unit price (QAR)</span></div>
        {Array.from({ length: Math.max(LINE_ROWS, values.lines?.length ?? 0) }, (_, i) => {
          const l = values.lines?.[i];
          return <div key={i} className="grid grid-cols-[3fr_1fr_1fr] gap-2 mb-1.5">
            <input name={`desc${i}`} defaultValue={l?.description ?? ""} maxLength={500} className={field} />
            <input name={`qty${i}`} type="number" step="0.001" min="0" defaultValue={l ? String(l.quantity) : ""} placeholder="1" className={field} />
            <input name={`price${i}`} type="number" step="0.01" defaultValue={l ? String(l.unitPrice) : ""} className={field} />
          </div>;
        })}
      </div>
      <div><label className={labelCls}>Notes</label><textarea name="notes" rows={2} defaultValue={values.notes ?? ""} className={field} /></div>
      <button type="submit" className="rounded-md bg-foreground px-4 py-1.5 text-sm text-white">{submitLabel}</button>
    </form>
  );
}
