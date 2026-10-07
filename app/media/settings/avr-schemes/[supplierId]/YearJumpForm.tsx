"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function YearJumpForm({ supplierId, defaultYear }: { supplierId: string; defaultYear: number }) {
  const router = useRouter();
  const [year, setYear] = useState(String(defaultYear));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const y = Number(year);
        if (Number.isFinite(y)) router.push(`/media/settings/avr-schemes/${supplierId}/${y}`);
      }}
      className="flex items-end gap-2"
    >
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Year</label>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium whitespace-nowrap">
        Open / Add Year
      </button>
    </form>
  );
}
