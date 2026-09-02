import { fetchCanonDevices, type CanonDevice } from "./canon.server";
import { sendMail, type SmtpConfig } from "./email.server";

export type ReportSettings = {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  to_emails: string[];
  cc_emails: string[];
  subject_prefix: string;
  daily_enabled: boolean;
  send_hour_utc: number;
  send_minute_utc: number;
  updated_at: string;
};

export type PublicReportSettings = Omit<ReportSettings, "smtp_password"> & {
  smtp_password_set: boolean;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadSettings(): Promise<ReportSettings> {
  const db = await admin();
  const { data, error } = await db.from("report_settings").select("*").eq("id", 1).single();
  if (error) throw new Error(`Could not load report settings: ${error.message}`);
  return data as unknown as ReportSettings;
}

export function toPublicSettings(s: ReportSettings): PublicReportSettings {
  const { smtp_password, ...rest } = s;
  return { ...rest, smtp_password_set: Boolean(smtp_password) };
}

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nf = (value: number | null) => (value === null || value === undefined ? "—" : value.toLocaleString("en-ZA"));

function buildHtml(devices: CanonDevice[], distributorName: string | null, fetchedAt: string) {
  const headers = [
    "Customer",
    "Customer ID",
    "Model",
    "Serial no.",
    "Type",
    "Installed",
    "Last comms",
    "Total (501)",
    "B/W (113)",
    "Colour (112)",
    "Copy B/W (123)",
    "Copy colour (122)",
    "RDS version",
  ];

  const totalPages = devices.reduce((sum, d) => sum + (d.totalCounter ?? 0), 0);
  const colourUnits = devices.filter((d) => d.color).length;
  const stale = devices.filter((d) => {
    if (!d.lastReceived) return true;
    const ts = new Date(d.lastReceived).getTime();
    return Number.isFinite(ts) ? Date.now() - ts > 7 * 24 * 3600 * 1000 : true;
  }).length;

  const cell = "padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;";
  const rows = devices
    .map(
      (d, i) => `<tr style="background:${i % 2 ? "#f9fafb" : "#ffffff"}">
<td style="${cell}font-weight:600;">${esc(d.customerName)}</td>
<td style="${cell}color:#6b7280;">${esc(d.customerId)}</td>
<td style="${cell}">${esc(d.model)}</td>
<td style="${cell}font-family:monospace;">${esc(d.serialNo)}</td>
<td style="${cell}">${d.color ? "Colour" : "Mono"}</td>
<td style="${cell}white-space:nowrap;">${esc(d.installDate ?? "—")}</td>
<td style="${cell}white-space:nowrap;color:#6b7280;">${esc(d.lastReceived ?? "—")}</td>
<td style="${cell}text-align:right;font-weight:600;">${nf(d.totalCounter)}</td>
<td style="${cell}text-align:right;">${nf(d.bwCounter)}</td>
<td style="${cell}text-align:right;">${nf(d.colorCounter)}</td>
<td style="${cell}text-align:right;">${nf(d.copyBw)}</td>
<td style="${cell}text-align:right;">${nf(d.copyColor)}</td>
<td style="${cell}color:#6b7280;">${esc(d.rdsVersion ?? "—")}</td>
</tr>`,
    )
    .join("\n");

  const th =
    "padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#374151;border-bottom:2px solid #d1d5db;white-space:nowrap;";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<h1 style="margin:0 0 4px;font-size:20px;">Canon copier fleet report</h1>
<p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
${esc(distributorName ?? "Canon eMaintenance")} · generated ${esc(new Date(fetchedAt).toLocaleString("en-ZA"))}
</p>
<table style="border-collapse:collapse;margin-bottom:20px;font-size:13px;">
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Devices</td><td style="padding:4px 0;font-weight:700;">${devices.length}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Colour units</td><td style="padding:4px 0;font-weight:700;">${colourUnits}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Total pages (counter 501)</td><td style="padding:4px 0;font-weight:700;">${totalPages.toLocaleString("en-ZA")}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">No comms in 7 days</td><td style="padding:4px 0;font-weight:700;">${stale}</td></tr>
</table>
<table style="border-collapse:collapse;width:100%;">
<thead><tr>${headers.map((h) => `<th style="${th}">${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="margin-top:24px;font-size:11px;color:#9ca3af;">Automated report from your Canon eMaintenance dashboard.</p>
</body></html>`;

  const text = [
    `Canon copier fleet report — ${distributorName ?? "Canon eMaintenance"}`,
    `Generated ${new Date(fetchedAt).toLocaleString("en-ZA")}`,
    `Devices: ${devices.length} · Colour: ${colourUnits} · Total pages: ${totalPages} · No comms 7d: ${stale}`,
    "",
    ...devices.map(
      (d) =>
        `${d.customerName} | ${d.model} | ${d.serialNo} | total ${nf(d.totalCounter)} | last comms ${d.lastReceived ?? "—"}`,
    ),
  ].join("\n");

  return { html, text, summary: { totalPages, colourUnits, stale } };
}

export async function runReport(triggeredBy: "manual" | "cron"): Promise<{
  ok: boolean;
  deviceCount?: number;
  provider?: string;
  recipients?: string[];
  error?: string;
}> {
  const started = Date.now();
  const db = await admin();
  let settings: ReportSettings | null = null;

  try {
    settings = await loadSettings();
    const recipients = settings.to_emails.filter(Boolean);
    const config: SmtpConfig = {
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      username: settings.smtp_username,
      password: settings.smtp_password,
      fromEmail: settings.from_email,
      fromName: settings.from_name,
    };

    const { devices, distributorName, fetchedAt } = await fetchCanonDevices();
    const { html, text } = buildHtml(devices, distributorName, fetchedAt);

    const subject = `${settings.subject_prefix} — ${devices.length} devices — ${new Date(fetchedAt).toLocaleDateString("en-ZA")}`;
    const { provider } = await sendMail(config, {
      to: recipients,
      cc: settings.cc_emails.filter(Boolean),
      subject,
      html,
      text,
    });

    await db.from("report_runs").insert({
      triggered_by: triggeredBy,
      status: "sent",
      device_count: devices.length,
      recipients,
      provider,
      duration_ms: Date.now() - started,
    });

    return { ok: true, deviceCount: devices.length, provider, recipients };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Daily report failed:", message);
    await db.from("report_runs").insert({
      triggered_by: triggeredBy,
      status: "failed",
      recipients: settings?.to_emails ?? [],
      error: message.slice(0, 1000),
      duration_ms: Date.now() - started,
    });
    return { ok: false, error: message };
  }
}
