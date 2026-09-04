import { createServerFn } from "@tanstack/react-start";

export const getCanonDevices = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCanonDevices } = await import("./canon.server");
  try {
    const result = await fetchCanonDevices();
    const { publishMeterSnapshot } = await import("./meters.server");
    const snapshot = await publishMeterSnapshot(result.devices, result.fetchedAt);
    return { ok: true as const, ...result, snapshot };
  } catch (error) {
    console.error("Canon fetch failed:", error);
    return {
      ok: false as const,
      devices: [],
      distributorName: null,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

export const publishMetersNow = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchCanonDevices } = await import("./canon.server");
  const { publishMeterSnapshot, METERS_RAW_URL } = await import("./meters.server");
  try {
    const { devices, fetchedAt } = await fetchCanonDevices();
    const snapshot = await publishMeterSnapshot(devices, fetchedAt);
    return { ...snapshot, rawUrl: METERS_RAW_URL };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
      rawUrl: METERS_RAW_URL,
    };
  }
});
