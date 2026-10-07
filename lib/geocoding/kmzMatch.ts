import "server-only";
import { findAssetMatches, MATCH_CONFIDENT_THRESHOLD, MATCH_AMBIGUOUS_GAP } from "@/lib/ingestion/matching";
import type { KmzPlacemark } from "./kmz";

export interface MatchableAsset {
  id: string;
  assetName: string;
  locationName: string;
  area: string | null;
  latitude: unknown;
  supplierName?: string;
}

export interface PendingPlacemark {
  name: string;
  lat: number;
  lon: number;
  reason: "no_confident_match" | "ambiguous_asset" | "duplicate_coords";
}

export interface KmzMatchResult {
  applied: Array<{
    placemarkName: string;
    assetId: string;
    assetName: string;
    locationName: string;
    supplierName?: string;
    score: number;
    lat: number;
    lon: number;
  }>;
  skippedAlreadyGeocoded: Array<{ placemarkName: string; assetName: string }>;
  pending: PendingPlacemark[];
}

/**
 * The exact same rigor applied when this matching was first done by hand
 * for the map's KMZ imports (see docs/map-notes.md): the calibrated
 * findAssetMatches scorer, plus two safety checks before anything is
 * ever written — no duplicate-named placemark at different coordinates,
 * and no asset confidently matched by more than one distinct placemark
 * (bijective). This never overwrites an asset that already has real
 * coordinates. Anything not confidently and unambiguously resolved is
 * returned in `pending` for manual review rather than discarded — a
 * supplier's own circuit numbering (e.g. Elan's "SE-009") often groups
 * many physical units under one product-type asset, which no amount of
 * fuzzy text matching against the asset's name can bridge on its own.
 */
export function matchKmzToSupplier(placemarks: KmzPlacemark[], assets: MatchableAsset[]): KmzMatchResult {
  const result: KmzMatchResult = {
    applied: [],
    skippedAlreadyGeocoded: [],
    pending: [],
  };

  const byName = new Map<string, KmzPlacemark[]>();
  for (const pm of placemarks) {
    if (pm.name.trim().length < 4) continue;
    if (!byName.has(pm.name)) byName.set(pm.name, []);
    byName.get(pm.name)!.push(pm);
  }

  type Candidate = {
    placemarkName: string;
    assetId: string;
    assetName: string;
    locationName: string;
    supplierName?: string;
    score: number;
    lat: number;
    lon: number;
  };
  const candidates: Candidate[] = [];

  for (const [name, pms] of byName) {
    const distinctCoords = new Set(pms.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`));
    if (distinctCoords.size > 1) {
      result.pending.push({ name, lat: pms[0].lat, lon: pms[0].lon, reason: "duplicate_coords" });
      continue;
    }
    const matches = findAssetMatches(name, null, assets.map((a) => ({ id: a.id, assetName: a.assetName, locationName: a.locationName, area: a.area })));
    if (matches.length === 0) {
      result.pending.push({ name, lat: pms[0].lat, lon: pms[0].lon, reason: "no_confident_match" });
      continue;
    }
    const top = matches[0];
    const second = matches[1];
    if (top.score < MATCH_CONFIDENT_THRESHOLD) {
      result.pending.push({ name, lat: pms[0].lat, lon: pms[0].lon, reason: "no_confident_match" });
      continue;
    }
    if (second && top.score - second.score < MATCH_AMBIGUOUS_GAP) {
      result.pending.push({ name, lat: pms[0].lat, lon: pms[0].lon, reason: "no_confident_match" });
      continue;
    }
    const assetFull = assets.find((a) => a.id === top.asset.id)!;
    if (assetFull.latitude !== null && assetFull.latitude !== undefined) {
      result.skippedAlreadyGeocoded.push({ placemarkName: name, assetName: assetFull.assetName });
      continue;
    }
    candidates.push({
      placemarkName: name,
      assetId: assetFull.id,
      assetName: assetFull.assetName,
      locationName: assetFull.locationName,
      supplierName: assetFull.supplierName,
      score: top.score,
      lat: pms[0].lat,
      lon: pms[0].lon,
    });
  }

  const byAsset = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (!byAsset.has(c.assetId)) byAsset.set(c.assetId, []);
    byAsset.get(c.assetId)!.push(c);
  }
  for (const [, group] of byAsset) {
    if (group.length > 1) {
      for (const g of group) {
        result.pending.push({ name: g.placemarkName, lat: g.lat, lon: g.lon, reason: "ambiguous_asset" });
      }
      continue;
    }
    result.applied.push(group[0]);
  }

  return result;
}
