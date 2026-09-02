import { createFileRoute } from "@tanstack/react-router";

/**
 * Called by the scheduled daily job. Protected by a shared secret header so the
 * public prefix cannot be abused to trigger mail sends.
 */
export const Route = createFileRoute("/api/public/daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["REPORT_CRON_SECRET"];
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { loadSettings, runReport } = await import("@/lib/report.server");
        const settings = await loadSettings();
        if (!settings.daily_enabled) {
          return Response.json({ skipped: true, reason: "daily_disabled" });
        }

        const result = await runReport("cron");
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
