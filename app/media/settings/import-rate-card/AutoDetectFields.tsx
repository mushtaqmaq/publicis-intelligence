"use client";

import { useState } from "react";

type Supplier = { id: string; name: string };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Best-effort filename-based guess, not a document-content parse — the
 *  user can always override the dropdown/year manually. Matches on
 *  substring containment of the supplier's *full* name only (spaces
 *  stripped by normalize, so "Kikano Media" matches "...Kikano
 *  Media.pdf" as one contiguous token). Deliberately does NOT fall back
 *  to matching just the first word of a multi-word name — an earlier
 *  version did, and it misidentified "Rate Card 2025 AAJ - Qatar.pdf"
 *  (a real Fadaat file) as "Qatar Airways" purely because both start
 *  with "Qatar". A generic word being a name's first word is common
 *  enough that "first word appears in filename" isn't good evidence. */
function guessSupplierId(filename: string, suppliers: Supplier[]): string | null {
  const normalizedFilename = normalize(filename);
  let best: { id: string; length: number } | null = null;
  for (const s of suppliers) {
    const normalizedCandidate = normalize(s.name);
    if (normalizedCandidate.length < 3) continue;
    if (normalizedFilename.includes(normalizedCandidate)) {
      if (!best || normalizedCandidate.length > best.length) {
        best = { id: s.id, length: normalizedCandidate.length };
      }
    }
  }
  return best?.id ?? null;
}

function guessYear(filename: string, fallback: number): number {
  const match = filename.match(/\b(20\d{2})\b/);
  if (!match) return fallback;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? year : fallback;
}

export function AutoDetectFields({ suppliers, currentYear }: { suppliers: Supplier[]; currentYear: number }) {
  const [supplierId, setSupplierId] = useState("");
  const [year, setYear] = useState(currentYear);
  const [detected, setDetected] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const guessedSupplierId = guessSupplierId(file.name, suppliers);
    const guessedYear = guessYear(file.name, currentYear);
    // Always set the supplier field from this file's own guess, including
    // clearing it back to unselected when nothing matches — otherwise a
    // confident guess from a previously selected file could linger and
    // mislead the user into uploading under the wrong supplier.
    setSupplierId(guessedSupplierId ?? "");
    setYear(guessedYear);
    setDetected(Boolean(guessedSupplierId) || guessedYear !== currentYear);
  }

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">File</label>
        <input type="file" name="file" accept=".pdf,.xlsx,.xls,.csv" required onChange={handleFileChange} className="block w-full text-sm" />
        {detected && (
          <p className="text-[11px] text-accent mt-1">
            Guessed supplier/year from the filename below — check them before uploading.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Supplier</label>
          <select
            name="supplierId"
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Rate Year</label>
          <input
            type="number"
            name="rateYear"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>
    </>
  );
}
