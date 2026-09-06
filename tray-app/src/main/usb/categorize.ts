/**
 * Categorize — decides where a stored file lives in the library.
 *
 *  - Screenshots never mix with camera photos: <Device>/Screenshots/<yyyy-mm>/
 *  - Photos with GPS (EXIF) go by place:      <Device>/Places/<City, CC>/<yyyy-mm>/
 *  - Everything else keeps the date layout:   <Device>/<yyyy>/<yyyy-mm>/
 *
 * Location lookup is fully offline: a bundled GeoNames city list (~34k cities,
 * CC-BY) matched by nearest distance. Nothing leaves the PC.
 */
import fs from "node:fs";
import path from "node:path";
import ExifReader from "exifreader";
import CITIES_JSON from "./cities.json" with { type: "json" }; // bundled inline by esbuild — works inside the packaged app too

type City = [name: string, country: string, lat: number, lon: number];
const CITIES: City[] = CITIES_JSON as City[];
function cities(): City[] {
  return CITIES;
}

export function isScreenshot(name: string, relPath: string): boolean {
  return /^screenshot/i.test(name) || /(^|\/)screenshots(\/|$)/i.test(relPath);
}

/** Signed decimal GPS coordinates from a JPEG's EXIF, or null. */
export async function gpsFromFile(filePath: string): Promise<{ lat: number; lon: number } | null> {
  if (!/\.(jpe?g)$/i.test(filePath)) return null;
  let tags;
  try {
    tags = await ExifReader.load(fs.readFileSync(filePath));
  } catch {
    return null;
  }
  const lat = tags["GPSLatitude"]?.description;
  const latRef = (tags["GPSLatitudeRef"] as { description?: string } | undefined)?.description;
  const lon = tags["GPSLongitude"]?.description;
  const lonRef = (tags["GPSLongitudeRef"] as { description?: string } | undefined)?.description;
  const la = typeof lat === "string" ? parseFloat(lat) : Number(lat);
  const lo = typeof lon === "string" ? parseFloat(lon) : Number(lon);
  if (!isFinite(la) || !isFinite(lo)) return null;
  return {
    lat: String(latRef).startsWith("S") ? -Math.abs(la) : Math.abs(la),
    lon: String(lonRef).startsWith("W") ? -Math.abs(lo) : Math.abs(lo),
  };
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLa = ((bLat - aLat) * Math.PI) / 180;
  const dLo = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Best known place within `maxKm` — the most populous city in range wins,
 *  so photos read "Istanbul, TR" instead of an obscure district name.
 *  (cities.json is pre-sorted by population, descending.) */
export function nearestPlace(lat: number, lon: number, maxKm = 50): string | null {
  for (const c of cities()) {
    if (haversineKm(lat, lon, c[2], c[3]) <= maxKm) return `${c[0]}, ${c[1]}`;
  }
  return null;
}

export interface CategorizeInput {
  name: string;
  relPath: string;
  /** Unix seconds; already "sane" (engine substitutes now() for unknown). */
  when: number;
  /** Staged local copy — read EXIF from here before promotion. */
  stagePath: string;
}

/** Default routing. Returns subdirectories under the device folder. */
export async function defaultCategorize(i: CategorizeInput): Promise<string> {
  const d = new Date(i.when * 1000);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (isScreenshot(i.name, i.relPath)) return path.join("Screenshots", ym);
  const gps = await gpsFromFile(i.stagePath);
  if (gps) {
    const place = nearestPlace(gps.lat, gps.lon);
    if (place) return path.join("Places", place, ym);
  }
  return path.join(String(d.getFullYear()), ym);
}
