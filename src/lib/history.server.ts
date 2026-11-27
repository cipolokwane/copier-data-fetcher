import { listMeterFileCommits, readMeterFileAtCommit } from "./github.server";

export const METER_HISTORY_COLUMNS = [
  "serial_number",
  "device_model",
  "customer_name",
  "a4_mono",
  "a4_colour",
  "a3_mono",
  "a3_colour",
  "scans",
  "reading_date",
] as const;

export type HistoricalMeterRow = {
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

export type HistoricalMeterSnapshot = {
  sha: string;
  date: string;
  rows: HistoricalMeterRow[];
};

export function buildGitHubCommitDateRange(from: string, to: string) {
  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };

  if (!isValidDate(from) || !isValidDate(to)) throw new Error("Choose valid start and end dates.");
  if (from > to) throw new Error("The start date must be on or before the end date.");

  return { since: `${from}T00:00:00Z`, until: `${to}T23:59:59Z` };
}

export function parseMeterSnapshotCsv(csv: string): HistoricalMeterRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split(",") ?? [];
  if (header.length !== METER_HISTORY_COLUMNS.length ||
      !METER_HISTORY_COLUMNS.every((column, index) => header[index] === column)) {
    throw new Error("This snapshot does not use the expected meter CSV columns.");
  }

  return lines.flatMap((line) => {
    const cells = line.split(",");
    if (cells.length !== METER_HISTORY_COLUMNS.length) return [];
    const number = (index: number) => {
      const value = Number(cells[index]);
      return Number.isFinite(value) ? value : 0;
    };
    return [{
      serial_number: cells[0] ?? "",
      device_model: cells[1] ?? "",
      customer_name: cells[2] ?? "",
      a4_mono: number(3),
      a4_colour: number(4),
      a3_mono: number(5),
      a3_colour: number(6),
      scans: number(7),
      reading_date: cells[8] ?? "",
    }];
  });
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildMeterHistoryExportCsv(snapshots: HistoricalMeterSnapshot[]): string {
  const headers = ["snapshot_time", "snapshot_sha", ...METER_HISTORY_COLUMNS];
  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      const values = [snapshot.date, snapshot.sha, ...METER_HISTORY_COLUMNS.map((column) => row[column])];
      lines.push(values.map(escapeCsvCell).join(","));
    }
  }

  return lines.join("\n");
}

export async function getMeterHistory(from: string, to: string) {
  const range = buildGitHubCommitDateRange(from, to);
  return listMeterFileCommits(range.since, range.until);
}

export async function getMeterSnapshot(sha: string) {
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Choose a valid snapshot.");
  const csv = await readMeterFileAtCommit(sha);
  return { csv, rows: parseMeterSnapshotCsv(csv) };
}

export async function exportMeterHistory(from: string, to: string) {
  const range = buildGitHubCommitDateRange(from, to);
  const { commits, truncated } = await listMeterFileCommits(range.since, range.until);
  if (truncated) throw new Error("This date range contains more than 2,000 snapshots. Narrow the dates and try again.");

  const snapshots: HistoricalMeterSnapshot[] = [];
  for (let index = 0; index < commits.length; index += 6) {
    const batch = commits.slice(index, index + 6);
    const loaded = await Promise.all(batch.map(async (commit) => {
      if (!/^[0-9a-f]{40}$/i.test(commit.sha)) throw new Error("GitHub returned an invalid snapshot reference.");
      const csv = await readMeterFileAtCommit(commit.sha);
      return { sha: commit.sha, date: commit.date, rows: parseMeterSnapshotCsv(csv) };
    }));
    snapshots.push(...loaded);
  }

  const csv = buildMeterHistoryExportCsv(snapshots);
  return {
    csv,
    snapshotCount: snapshots.length,
    deviceRowCount: snapshots.reduce((count, snapshot) => count + snapshot.rows.length, 0),
  };
}