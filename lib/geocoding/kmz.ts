import "server-only";
import JSZip from "jszip";

export interface KmzPlacemark {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Extracts every named Placemark with a coordinate from a KMZ (a zip
 * containing one or more .kml files) or a raw .kml file. Pure-JS (jszip),
 * no shelling out to the `unzip` binary — that would work in local dev but
 * not in Vercel's serverless runtime.
 */
export async function parseKmz(buffer: Buffer): Promise<KmzPlacemark[]> {
  let kml: string;

  // A raw .kml file is plain XML text, not a zip — detect and skip
  // unzipping in that case rather than failing.
  const looksLikeZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (looksLikeZip) {
    const zip = await JSZip.loadAsync(buffer);
    const kmlEntry = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith(".kml"));
    if (!kmlEntry) throw new Error("No .kml file found inside this KMZ archive.");
    kml = await kmlEntry.async("string");
  } else {
    kml = buffer.toString("utf-8");
  }

  const placemarkRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  const results: KmzPlacemark[] = [];
  let match: RegExpExecArray | null;
  while ((match = placemarkRe.exec(kml))) {
    const block = match[1];
    const nameMatch = block.match(/<name>([^<]*)<\/name>/);
    const coordMatch = block.match(/<coordinates>([^<]*)<\/coordinates>/);
    if (!nameMatch || !coordMatch) continue;
    const name = nameMatch[1].trim();
    if (!name) continue;
    const parts = coordMatch[1].trim().split(",");
    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    results.push({ name, lat, lon });
  }
  return results;
}
