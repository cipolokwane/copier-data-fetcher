/**
 * Builds the public meter snapshot (data/meters.csv) and publishes it to GitHub.
 * Only ever called after a SUCCESSFUL Canon fetch with devices present, so a
 * failed fetch leaves the last good snapshot in place.
 */
import type { CanonDevice } from "./canon.server";
import { publishFile } from "./github.server";

export const METERS_CSV_PATH = "data/meters.csv";
export const METERS_JSON_PATH = "data/meters.json";
export const METERS_RAW_URL =
  "https://raw.githubusercontent.com/cipolokwane/copier-data-fetcher/main/data/meters.csv";

const HEADER =
  "serial_number,device_model,customer_name,a4_mono,a4_colour,a3_mono,a3_colour,scans,reading_date";

const int = (value: number | null | undefined) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;

const csvField = (value: string) => value.replace(/[",\r\n]+/g, " ").replace(/\s+/g, " ").trim();

const pick = (meters: Record<string, number>, ...ids: string[]) => {
  for (const id of ids) if (id in meters) return int(meters[id]);
  return 0;
};

function isoDate(value: string | null, fallback: string): string {
  if (value) {
    const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return fallback.slice(0, 10);
}

export type MeterRowOut = {
  serial_number: string;
  device_model: string;
  customer_name: string;
  a4_mono: number;
  a4_colour: number;
  a3_mono: number;
  a3_colour: number;
  scans: number;
  reading_date: string;
};

export function buildMeterRows(devices: CanonDevice[], fetchedAt: string): MeterRowOut[] {
  const fallbackDate = fetchedAt.slice(0, 10);
  const seen = new Set<string>();
  const rows: MeterRowOut[] = [];

  for (const device of devices) {
    const serial = csvField(device.serialNo ?? "");
    if (!serial || seen.has(serial)) continue;
    seen.add(serial);

    const m = device.meters ?? {};
    // Canon counters: 105/106 colour totals, 108/109/113 mono totals,
    // 107 large (A3) colour, 110 large (A3) mono.
    const colourTotal = pick(m, "105", "106", "112");
    const monoTotal = pick(m, "108", "109", "113");
    const a3Colour = Math.min(pick(m, "107", "183"), colourTotal);
    const a3Mono = Math.min(pick(m, "110", "184"), monoTotal);

    rows.push({
      serial_number: serial,
      device_model: csvField(device.model ?? ""),
      customer_name: csvField(device.customerName ?? ""),
      a4_mono: Math.max(0, monoTotal - a3Mono),
      a4_colour: Math.max(0, colourTotal - a3Colour),
      a3_mono: a3Mono,
      a3_colour: a3Colour,
      scans: pick(m, "071", "064", "072"),
      reading_date: isoDate(device.lastReceived, fallbackDate),
    });
  }

  return rows;
}

export function buildMetersCsv(devices: CanonDevice[], fetchedAt: string): string {
  const rows = buildMeterRows(devices, fetchedAt);
  const lines = [
    HEADER,
    ...rows.map((r) =>
      [
        r.serial_number,
        r.device_model,
        r.customer_name,
        r.a4_mono,
        r.a4_colour,
        r.a3_mono,
        r.a3_colour,
        r.scans,
        r.reading_date,
      ].join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}

export async function publishMeterSnapshot(
  devices: CanonDevice[],
  fetchedAt: string,
): Promise<{ ok: boolean; url?: string; rows?: number; error?: string }> {
  try {
    if (!devices.length) return { ok: false, error: "No devices in fetch — snapshot left unchanged." };
    const rows = buildMeterRows(devices, fetchedAt);
    if (!rows.length) return { ok: false, error: "No device rows — snapshot left unchanged." };

    const date = fetchedAt.slice(0, 10);
    const message = `auto: meters ${date} (${rows.length} devices)`;
    const url = await publishFile(METERS_CSV_PATH, buildMetersCsv(devices, fetchedAt), message);
    try {
      await publishFile(
        METERS_JSON_PATH,
        JSON.stringify({ generated_at: fetchedAt, count: rows.length, devices: rows }, null, 2) + "\n",
        message,
      );
    } catch (error) {
      console.error("meters.json publish failed:", error);
    }
    return { ok: true, url, rows: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Meter snapshot publish failed:", message);
    return { ok: false, error: message };
  }
}
