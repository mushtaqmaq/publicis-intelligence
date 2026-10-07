"use client";

import { useState } from "react";

const MEDIA_CHANNELS = ["OOH", "RADIO", "TV", "PRINT", "CINEMA", "SMS", "DIGITAL"] as const;

export function MediumSupplierSelect({
  suppliers,
  initialMedium,
  initialSupplier,
  mediumFieldName = "medium",
  supplierFieldName = "supplier",
  mediumPlaceholder = "All media",
  supplierPlaceholder = "All suppliers",
}: {
  suppliers: Array<{ id: string; name: string; mediaChannel: string }>;
  initialMedium: string;
  initialSupplier: string;
  mediumFieldName?: string;
  supplierFieldName?: string;
  mediumPlaceholder?: string;
  supplierPlaceholder?: string;
}) {
  const [medium, setMedium] = useState(initialMedium);
  const filteredSuppliers = medium ? suppliers.filter((s) => s.mediaChannel === medium) : suppliers;
  const supplierStillValid = filteredSuppliers.some((s) => s.id === initialSupplier);

  return (
    <>
      <select
        name={mediumFieldName}
        value={medium}
        onChange={(e) => setMedium(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="">{mediumPlaceholder}</option>
        {MEDIA_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        name={supplierFieldName}
        defaultValue={supplierStillValid ? initialSupplier : ""}
        key={medium}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="">{supplierPlaceholder}{medium ? ` (${medium})` : ""}</option>
        {filteredSuppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </>
  );
}
