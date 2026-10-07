"use client";

import { useState } from "react";

export interface ComponentRow {
  label: string;
  quantity: string;
  sizeRaw: string;
  linkedAssetId: string;
}

export function PackageComponentsEditor({ initial }: { initial: ComponentRow[] }) {
  const [rows, setRows] = useState<ComponentRow[]>(initial.length > 0 ? initial : []);

  const update = (index: number, field: keyof ComponentRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, { label: "", quantity: "", sizeRaw: "", linkedAssetId: "" }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  return (
    <div>
      <input type="hidden" name="packageComponents" value={JSON.stringify(rows)} readOnly />
      <p className="text-xs text-muted mb-3">
        Mark this asset as a package by listing what physical components it covers (e.g. Break
        Media&apos;s &quot;City Centre Domination&quot; = Mupis (56), Pillars (6), Dropdowns (2)…).
        Leave empty if this is a single physical asset, not a bundle.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Component (e.g. Mupis)"
              value={row.label}
              onChange={(e) => update(i, "label", e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              placeholder="Qty"
              value={row.quantity}
              onChange={(e) => update(i, "quantity", e.target.value)}
              className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Size (e.g. 1.2m x 1.8m)"
              value={row.sizeRaw}
              onChange={(e) => update(i, "sizeRaw", e.target.value)}
              className="w-40 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs text-[var(--danger)] underline shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 text-xs text-accent underline"
      >
        + Add component
      </button>
    </div>
  );
}
