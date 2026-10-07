"use client";

import { useState } from "react";

export function FormatFields({
  initialFormat,
  categories,
  defaultCategoryId,
  mediaType,
  numberOfFaces,
  numberOfScreens,
  numberOfCircuits,
  numberOfPoles,
}: {
  initialFormat: string;
  categories: { id: string; name: string; isActive: boolean }[];
  defaultCategoryId: string;
  mediaType: string | null;
  numberOfFaces: number | null;
  numberOfScreens: number | null;
  numberOfCircuits: number | null;
  numberOfPoles: number | null;
}) {
  const [format, setFormat] = useState(initialFormat);
  const isOoh = format !== "";

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Format</label>
          <select
            name="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Not applicable (non-OOH — TV, Radio, Print, Cinema, SMS, or an online digital campaign)</option>
            <option value="STATIC">Static (OOH)</option>
            <option value="DIGITAL">Digital (DOOH screens)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Category</label>
          <select
            name="mediaCategoryId"
            defaultValue={defaultCategoryId}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">{isOoh ? "Media Type" : "Platform"}</label>
        <input
          type="text"
          name="mediaType"
          defaultValue={mediaType ?? ""}
          placeholder={isOoh ? "e.g. MUPI, Sandwich Board" : "e.g. DV360, Meta, Google Search, Programmatic Display"}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>

      {isOoh ? (
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Faces</label>
            <input
              type="number"
              name="numberOfFaces"
              defaultValue={numberOfFaces ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Screens</label>
            <input
              type="number"
              name="numberOfScreens"
              defaultValue={numberOfScreens ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Circuits</label>
            <input
              type="number"
              name="numberOfCircuits"
              defaultValue={numberOfCircuits ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Poles</label>
            <input
              type="number"
              name="numberOfPoles"
              defaultValue={numberOfPoles ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Faces / Screens / Circuits / Poles are OOH structural fields and don&apos;t apply here — select Static or Digital above if this is
          actually a physical OOH sign. Saving now will clear any values previously set in those fields.
        </p>
      )}
    </>
  );
}
