import { describe, expect, test } from "bun:test";
import { buildGitHubCommitDateRange, parseMeterSnapshotCsv } from "../src/lib/history.server";

describe("historical meter snapshots", () => {
  test("includes the complete selected dates in the GitHub search range", () => {
    expect(buildGitHubCommitDateRange("2026-11-01", "2026-11-02")).toEqual({
      since: "2026-11-01T00:00:00Z",
      until: "2026-11-02T23:59:59Z",
    });
  });

  test("rejects invalid and reversed date ranges", () => {
    expect(() => buildGitHubCommitDateRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => buildGitHubCommitDateRange("2026-11-02", "2026-11-01")).toThrow();
  });

  test("parses the meter columns from one historical CSV row", () => {
    const csv = [
      "serial_number,device_model,customer_name,a4_mono,a4_colour,a3_mono,a3_colour,scans,reading_date",
      "SN-1,imageRUNNER C1325,Example Customer,120,30,40,10,5,2026-11-01",
    ].join("\n");

    expect(parseMeterSnapshotCsv(csv)).toEqual([
      {
        serial_number: "SN-1",
        device_model: "imageRUNNER C1325",
        customer_name: "Example Customer",
        a4_mono: 120,
        a4_colour: 30,
        a3_mono: 40,
        a3_colour: 10,
        scans: 5,
        reading_date: "2026-11-01",
      },
    ]);
  });
});