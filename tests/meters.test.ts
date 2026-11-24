import { describe, expect, test } from "bun:test";
import { readMeterSummary } from "../src/lib/canon.server";
import { buildMeterRows } from "../src/lib/meters.server";
import type { CanonDevice } from "../src/lib/canon.server";

function device(meters: Record<string, number>): CanonDevice {
  return {
    serialNo: "SCAN-TEST-001",
    model: "Canon scan test",
    customerName: "Test customer",
    customerId: "TEST-001",
    distributorName: "Test distributor",
    deviceUniqueId: "device-test-001",
    rdsVersion: null,
    statusCode: null,
    color: false,
    installDate: null,
    lastReceived: null,
    totalCounter: null,
    bwCounter: null,
    colorCounter: null,
    copyBw: null,
    copyColor: null,
    meters,
  };
}

describe("meter scan count", () => {
  test("uses counter 101 as the print total, not scan counter 501", () => {
    const summary = readMeterSummary({ "101": 82142, "501": 22647 });

    expect(summary.totalCounter).toBe(82142);
  });

  test("uses Canon counter 501 instead of the duplex counter 071", () => {
    const [row] = buildMeterRows(
      [device({ "071": 4, "501": 22647 })],
      "2026-11-19T00:00:00.000Z",
    );

    expect(row?.scans).toBe(22647);
  });

  test("uses counter 502 when counter 501 is unavailable", () => {
    const [row] = buildMeterRows(
      [device({ "071": 4, "502": 19406 })],
      "2026-11-19T00:00:00.000Z",
    );

    expect(row?.scans).toBe(19406);
  });
});