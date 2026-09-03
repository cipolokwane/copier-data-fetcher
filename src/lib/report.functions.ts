import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ReportRun = {
  id: string;
  triggered_by: string;
  status: string;
  device_count: number | null;
  recipients: string[];
  provider: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

const settingsSchema = z.object({
  smtp_host: z.string().trim().max(255),
  smtp_port: z.number().int().min(1).max(65535),
  smtp_secure: z.boolean(),
  smtp_username: z.string().trim().max(255),
  smtp_password: z.string().max(500).optional(),
  from_email: z.string().trim().max(255),
  from_name: z.string().trim().max(120),
  to_emails: z.array(z.string().trim().email()).max(20),
  cc_emails: z.array(z.string().trim().email()).max(20),
  subject_prefix: z.string().trim().min(1).max(160),
  daily_enabled: z.boolean(),
  send_hour_utc: z.number().int().min(0).max(23),
  send_minute_utc: z.number().int().min(0).max(59),
});

export const getReportSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { loadSettings, toPublicSettings } = await import("./report.server");
  const settings = await loadSettings();
  return toPublicSettings(settings);
});

export const saveReportSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { toPublicSettings } = await import("./report.server");
    const { smtp_password, ...rest } = data;
    const patch = smtp_password ? { ...rest, smtp_password } : rest;

    const { data: row, error } = await supabaseAdmin
      .from("report_settings")
      .update(patch)
      .eq("id", 1)
      .select("*")
      .single();
    if (error) throw new Error(`Could not save settings: ${error.message}`);
    return toPublicSettings(row as never);
  });

export const runReportNow = createServerFn({ method: "POST" }).handler(async () => {
  const { runReport } = await import("./report.server");
  return runReport("manual");
});

export const listReportRuns = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("report_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ReportRun[];
});
