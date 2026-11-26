import { createServerFn } from "@tanstack/react-start";

export const getCanonDevices = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCanonDevices } = await import("./canon.server");
  try {
    const result = await fetchCanonDevices();
    const { publishMeterSnapshot } = await import("./meters.server");
    const snapshot = await publishMeterSnapshot(result.devices, result.fetchedAt);
    let locationBySerial = new Map<string, string>();
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/cipolokwane/copier-data-fetcher/main/data/device_information.json",
        { cache: "no-store" },
      );
      if (response.ok) {
        const info = (await response.json()) as {
          devices?: { serial_number?: string; location?: string }[];
        };
        locationBySerial = new Map(
          (info.devices ?? [])
            .filter((device) => device.serial_number)
            .map((device) => [device.serial_number ?? "", device.location ?? ""]),
        );
      }
    } catch (error) {
      console.warn("Device locations unavailable; loading fleet without locations:", error);
    }
    const devices = result.devices.map((device) => ({
      ...device,
      location: locationBySerial.get(device.serialNo) ?? null,
    }));
    return { ok: true as const, ...result, devices, snapshot };
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
