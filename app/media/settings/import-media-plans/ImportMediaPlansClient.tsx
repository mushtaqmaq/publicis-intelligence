"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { ParsedMediaPlan, MediaPlanImportRow, MediaPlanImportPlatformRow, CommitResult } from "./actions";
import type { MediaChannel } from "@/generated/prisma/enums";

const NEW_CLIENT = "__new__";
const DIRECT = "__direct__";

const CHANNEL_OPTIONS: { value: MediaChannel; label: string }[] = [
  { value: "DIGITAL", label: "Digital" },
  { value: "OOH", label: "OOH" },
  { value: "TV", label: "TV" },
  { value: "PRINT", label: "Print" },
  { value: "RADIO", label: "Radio" },
  { value: "CINEMA", label: "Cinema" },
  { value: "SMS", label: "SMS" },
];

type EditablePlatformRow = {
  platform: string;
  netToMedia: string;
  agencyFeeAmount: string;
  irAmount: string;
  netToClient: string;
  buyingEntityId: string; // DIRECT sentinel or a real Supplier id
};

type EditableRow = {
  sourceFile: string;
  clientSelection: string;
  newClientName: string;
  campaignName: string;
  planCode: string;
  campaignStart: string;
  campaignEnd: string;
  currency: string;
  currencyLowConfidence: boolean;
  channel: MediaChannel;
  channelLowConfidence: boolean;
  netToClient: string;
  netToMedia: string;
  agencyFeeAmount: string;
  irAmount: string;
  platformRows: EditablePlatformRow[];
  warnings: string[];
  isDuplicatePlanCode: boolean;
  excluded: boolean;
};

// Allocates the file's real campaign-level Agency Fee/IR across platform
// rows using each row's own share of the real gross media total — not an
// invented split; this is the same ratio the file's own "Budget Allocation
// %" column encodes, computed directly from the real per-platform totals so
// it still works when that column's header is merged/offset in the source.
function buildPlatformRows(p: ParsedMediaPlan): EditablePlatformRow[] {
  const totalGross = p.platformRows.reduce((sum, r) => sum + r.grossMedia, 0);
  if (totalGross <= 0) return [];
  return p.platformRows.map((r) => {
    const share = r.grossMedia / totalGross;
    const agencyFee = p.agencyFeeAmount !== null ? Math.round(p.agencyFeeAmount * share * 100) / 100 : null;
    const ir = p.irAmount !== null ? Math.round(p.irAmount * share * 100) / 100 : null;
    const netToClient = Math.round((r.grossMedia + (agencyFee ?? 0)) * 100) / 100;
    return {
      platform: r.platform,
      netToMedia: String(r.grossMedia),
      agencyFeeAmount: agencyFee !== null ? String(agencyFee) : "",
      irAmount: ir !== null ? String(ir) : "",
      netToClient: String(netToClient),
      buyingEntityId: DIRECT,
    };
  });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function bestClientMatch(clientRaw: string | null, clients: { id: string; name: string }[]): string | null {
  if (!clientRaw) return null;
  const norm = normalize(clientRaw);
  const firstWord = norm.split(" ")[0];
  for (const c of clients) {
    const cNorm = normalize(c.name);
    if (cNorm === norm || norm.includes(cNorm) || cNorm.includes(norm)) return c.id;
  }
  // fall back to matching just the first significant word (e.g. "mcdonalds" in "mcdonalds qatar")
  if (firstWord.length > 3) {
    for (const c of clients) {
      if (normalize(c.name).includes(firstWord)) return c.id;
    }
  }
  return null;
}

function money(v: string, currency: string) {
  const n = Number(v);
  return v && Number.isFinite(n) ? `${currency} ${n.toLocaleString()}` : "—";
}

export function ImportMediaPlansClient({
  clients,
  suppliers,
  existingPlanCodes,
  parseFiles,
  commitImport,
}: {
  clients: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  existingPlanCodes: string[];
  parseFiles: (formData: FormData) => Promise<ParsedMediaPlan[]>;
  commitImport: (rows: MediaPlanImportRow[]) => Promise<CommitResult>;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [isParsing, startParsing] = useTransition();
  const [isCommitting, startCommitting] = useTransition();
  const [result, setResult] = useState<CommitResult | null>(null);
  const planCodeSet = useMemo(() => new Set(existingPlanCodes), [existingPlanCodes]);

  function handleParse() {
    if (files.length === 0) return;
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    startParsing(async () => {
      const parsed = await parseFiles(formData);
      setRows(
        parsed.map((p) => {
          const matchedClientId = bestClientMatch(p.clientRaw, clients);
          const isDuplicatePlanCode = !!p.planCode && planCodeSet.has(p.planCode);
          return {
            sourceFile: p.sourceFile,
            clientSelection: matchedClientId ?? NEW_CLIENT,
            newClientName: matchedClientId ? "" : p.clientRaw ?? "",
            campaignName: p.campaignName ?? "",
            planCode: p.planCode ?? "",
            campaignStart: p.campaignStart ?? "",
            campaignEnd: p.campaignEnd ?? "",
            currency: p.currency,
            currencyLowConfidence: p.currencyLowConfidence,
            channel: p.channel,
            channelLowConfidence: p.channelLowConfidence,
            netToClient: p.netToClient !== null ? String(p.netToClient) : "",
            netToMedia: p.netToMedia !== null ? String(p.netToMedia) : "",
            agencyFeeAmount: p.agencyFeeAmount !== null ? String(p.agencyFeeAmount) : "",
            irAmount: p.irAmount !== null ? String(p.irAmount) : "",
            platformRows: buildPlatformRows(p),
            warnings: p.warnings,
            isDuplicatePlanCode,
            excluded: isDuplicatePlanCode,
          };
        })
      );
      setResult(null);
    });
  }

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function updatePlatformRow(rowIndex: number, platformIndex: number, patch: Partial<EditablePlatformRow>) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIndex
          ? { ...r, platformRows: r.platformRows.map((p, pi) => (pi === platformIndex ? { ...p, ...patch } : p)) }
          : r
      )
    );
  }

  function handleCommit() {
    const included = rows.filter((r) => !r.excluded);
    const payload: MediaPlanImportRow[] = included.map((r) => {
      const platformRows: MediaPlanImportPlatformRow[] = r.platformRows.map((p) => ({
        platform: p.platform,
        netToMedia: Number(p.netToMedia) || 0,
        agencyFeeAmount: p.agencyFeeAmount ? Number(p.agencyFeeAmount) : null,
        irAmount: p.irAmount ? Number(p.irAmount) : null,
        netToClient: Number(p.netToClient) || 0,
        buyingEntityId: p.buyingEntityId === DIRECT ? null : p.buyingEntityId,
      }));
      return {
        sourceFile: r.sourceFile,
        clientId: r.clientSelection === NEW_CLIENT ? null : r.clientSelection,
        newClientName: r.clientSelection === NEW_CLIENT ? r.newClientName.trim() : null,
        campaignName: r.campaignName.trim(),
        planCode: r.planCode.trim(),
        campaignStart: r.campaignStart,
        campaignEnd: r.campaignEnd,
        currency: r.currency,
        channel: r.channel,
        netToClient: Number(r.netToClient),
        netToMedia: r.netToMedia ? Number(r.netToMedia) : null,
        agencyFeeAmount: r.agencyFeeAmount ? Number(r.agencyFeeAmount) : null,
        irAmount: r.irAmount ? Number(r.irAmount) : null,
        platformRows,
      };
    });
    startCommitting(async () => {
      const res = await commitImport(payload);
      setResult(res);
      if (res.created > 0) {
        setRows([]);
        setFiles([]);
        router.refresh();
      }
    });
  }

  const readyCount = rows.filter((r) => !r.excluded).length;

  return (
    <div className="mt-6 space-y-6">
      <div className="bg-surface border border-border rounded-lg p-5">
        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">Media plan files (.xlsx)</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:text-accent-foreground file:px-3 file:py-1.5 file:text-sm file:font-medium file:cursor-pointer"
        />
        <div className="flex items-center gap-3 mt-3">
          <Button type="button" onClick={handleParse} disabled={files.length === 0 || isParsing}>
            {isParsing ? "Parsing…" : `Parse ${files.length || ""} File${files.length === 1 ? "" : "s"}`}
          </Button>
          {files.length > 0 && <span className="text-xs text-muted">{files.length} file(s) selected</span>}
        </div>
      </div>

      {result && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <p className="text-foreground font-medium">Imported {result.created} media plan(s).</p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-[var(--warning)]">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  {s.sourceFile}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-4">
          {rows.map((row, i) => {
            const revenue =
              row.agencyFeeAmount || row.irAmount
                ? (Number(row.agencyFeeAmount) || 0) + (Number(row.irAmount) || 0)
                : null;
            return (
              <div key={row.sourceFile + i} className={`bg-surface border rounded-lg p-5 ${row.excluded ? "border-border opacity-60" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={!row.excluded} onChange={(e) => updateRow(i, { excluded: !e.target.checked })} />
                    <span className="text-sm font-medium text-foreground">{row.sourceFile}</span>
                  </div>
                  {row.isDuplicatePlanCode && (
                    <span className="text-xs text-[var(--danger)]">Plan code already exists — excluded by default</span>
                  )}
                </div>

                {row.warnings.length > 0 && (
                  <ul className="mt-2 text-xs text-[var(--warning)] list-disc list-inside">
                    {row.warnings.map((w, wi) => (
                      <li key={wi}>{w}</li>
                    ))}
                  </ul>
                )}
                {row.currencyLowConfidence && (
                  <p className="mt-2 text-xs text-[var(--warning)]">
                    Couldn&apos;t confirm this plan&apos;s currency from the file — defaulted to {row.currency}. Please confirm below.
                  </p>
                )}
                {row.channelLowConfidence && (
                  <p className="mt-2 text-xs text-[var(--warning)]">
                    Couldn&apos;t confirm the real media channel for this file — please pick the correct one below.
                  </p>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Client</label>
                    <select
                      value={row.clientSelection}
                      onChange={(e) => updateRow(i, { clientSelection: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      <option value={NEW_CLIENT}>+ New client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {row.clientSelection === NEW_CLIENT && (
                      <input
                        type="text"
                        value={row.newClientName}
                        onChange={(e) => updateRow(i, { newClientName: e.target.value })}
                        placeholder="New client name"
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm mt-1.5"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Campaign Name</label>
                    <input
                      type="text"
                      value={row.campaignName}
                      onChange={(e) => updateRow(i, { campaignName: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Plan Code</label>
                    <input
                      type="text"
                      value={row.planCode}
                      onChange={(e) => updateRow(i, { planCode: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Campaign Start</label>
                    <input
                      type="date"
                      value={row.campaignStart}
                      onChange={(e) => updateRow(i, { campaignStart: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Campaign End</label>
                    <input
                      type="date"
                      value={row.campaignEnd}
                      onChange={(e) => updateRow(i, { campaignEnd: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Currency</label>
                    <select
                      value={row.currency}
                      onChange={(e) => updateRow(i, { currency: e.target.value })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="QAR">QAR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Channel</label>
                    <select
                      value={row.channel}
                      onChange={(e) => updateRow(i, { channel: e.target.value as MediaChannel })}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      {CHANNEL_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {row.platformRows.length > 0 ? (
                  <div className="border-t border-border mt-4 pt-4">
                    <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
                      Per-platform breakdown ({row.currency}) — real totals from the file
                    </div>
                    <div className="space-y-3">
                      {row.platformRows.map((p, pi) => (
                        <div key={pi} className="rounded-md border border-border p-3">
                          <div className="text-sm font-medium text-foreground mb-2">{p.platform}</div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Net to Media</label>
                              <input
                                type="number"
                                step="0.01"
                                value={p.netToMedia}
                                onChange={(e) => updatePlatformRow(i, pi, { netToMedia: e.target.value })}
                                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Agency Fee</label>
                              <input
                                type="number"
                                step="0.01"
                                value={p.agencyFeeAmount}
                                onChange={(e) => updatePlatformRow(i, pi, { agencyFeeAmount: e.target.value })}
                                placeholder="—"
                                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">IR</label>
                              <input
                                type="number"
                                step="0.01"
                                value={p.irAmount}
                                onChange={(e) => updatePlatformRow(i, pi, { irAmount: e.target.value })}
                                placeholder="—"
                                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Net to Client</label>
                              <input
                                type="number"
                                step="0.01"
                                value={p.netToClient}
                                onChange={(e) => updatePlatformRow(i, pi, { netToClient: e.target.value })}
                                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                                Buying Entity / Seat
                              </label>
                              <select
                                value={p.buyingEntityId}
                                onChange={(e) => updatePlatformRow(i, pi, { buyingEntityId: e.target.value })}
                                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                              >
                                <option value={DIRECT}>Direct (no intermediary)</option>
                                {suppliers.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted mt-2">
                      Buying Entity/Seat is internal tracking only — it never appears in a client-facing export.
                    </p>
                  </div>
                ) : (
                  <div className="border-t border-border mt-4 pt-4">
                    <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Commercial breakdown ({row.currency})</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Net to Media</label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.netToMedia}
                          onChange={(e) => updateRow(i, { netToMedia: e.target.value })}
                          placeholder="—"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Agency Fee</label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.agencyFeeAmount}
                          onChange={(e) => updateRow(i, { agencyFeeAmount: e.target.value })}
                          placeholder="—"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">IR (Incentive Rebate)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.irAmount}
                          onChange={(e) => updateRow(i, { irAmount: e.target.value })}
                          placeholder="—"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Net to Client (required)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={row.netToClient}
                          onChange={(e) => updateRow(i, { netToClient: e.target.value })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-2">
                      Total Revenue (Agency Fee + IR):{" "}
                      <span className="font-medium text-foreground">{revenue !== null ? money(String(revenue), row.currency) : "—"}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleCommit} disabled={readyCount === 0 || isCommitting}>
              {isCommitting ? "Importing…" : `Import ${readyCount} Media Plan${readyCount === 1 ? "" : "s"}`}
            </Button>
            <span className="text-xs text-muted">Status is set to Completed on every imported plan.</span>
          </div>
        </div>
      )}
    </div>
  );
}
