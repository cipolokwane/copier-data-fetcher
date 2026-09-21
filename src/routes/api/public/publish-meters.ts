import { createFileRoute } from "@tanstack/react-router";

/**
 * Fetches Canon data and overwrites data/meters.csv in GitHub.
 * Independent of email so the public snapshot updates even if mail fails.
 * Protected by the same shared secret as the daily report.
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

  const { fetchCanonDevices } = await import("@/lib/canon.server");
  const { publishMeterSnapshot, METERS_RAW_URL } = await import("@/lib/meters.server");

  try {
    const { devices, fetchedAt } = await fetchCanonDevices();
    const snapshot = await publishMeterSnapshot(devices, fetchedAt);
    return Response.json(
      { ...snapshot, devices: devices.length, fetchedAt, rawUrl: METERS_RAW_URL },
      { status: snapshot.ok ? 200 : 500 },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        rawUrl: METERS_RAW_URL,
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
