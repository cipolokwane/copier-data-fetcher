import { createFileRoute } from "@tanstack/react-router";

/**
 * Hourly job: fetches Canon data and overwrites data/meters.csv and
 * data/device_information.csv in GitHub. Independent of email so the public
 * snapshots update even if mail fails. Protected by the shared cron secret.
 */
async function handle(request: Request) {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  const { loadSettings } = await import("@/lib/report.server");
  const settings = await loadSettings();
  const envSecret = process.env["REPORT_CRON_SECRET"] ?? "";
  const allowed = [settings.cron_token, envSecret].filter(Boolean);
  if (!provided || !allowed.includes(provided)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const only = url.searchParams.get("only");

  const { fetchCanonDevices } = await import("@/lib/canon.server");
  const { publishMeterSnapshot, METERS_RAW_URL } = await import("@/lib/meters.server");
  const { publishDeviceInfoSnapshot, DEVICE_INFO_RAW_URL } = await import("@/lib/device-info.server");

  try {
    const { devices, fetchedAt } = await fetchCanonDevices();
    const meters = only === "device-info" ? { ok: true, skipped: true } : await publishMeterSnapshot(devices, fetchedAt);
    const deviceInfo =
      only === "meters" ? { ok: true, skipped: true } : await publishDeviceInfoSnapshot(devices, fetchedAt);
    const ok = meters.ok && deviceInfo.ok;
    return Response.json(
      {
        ok,
        meters,
        deviceInfo,
        devices: devices.length,
        fetchedAt,
        metersUrl: METERS_RAW_URL,
        deviceInfoUrl: DEVICE_INFO_RAW_URL,
      },
      { status: ok ? 200 : 500 },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metersUrl: METERS_RAW_URL,
        deviceInfoUrl: DEVICE_INFO_RAW_URL,
      },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/publish-meters")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
