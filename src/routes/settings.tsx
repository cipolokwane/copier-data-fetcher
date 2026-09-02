import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getReportSettings,
  saveReportSettings,
  runReportNow,
  listReportRuns,
} from "@/lib/report.functions";
import { SiteNav } from "@/components/site-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Report & Mail Settings | Canon Fleet Dashboard" },
      {
        name: "description",
        content:
          "Configure the mail server, sender and recipients for the daily Canon copier fleet report, and send a test report immediately.",
      },
      { property: "og:title", content: "Report & Mail Settings | Canon Fleet Dashboard" },
      {
        property: "og:description",
        content:
          "Mail server, sender and recipient setup for the automated daily Canon eMaintenance fleet report.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const PROVIDER_HINTS: { host: string; label: string; port: string; hint: string }[] = [
  { host: "smtp.resend.com", label: "Resend", port: "587", hint: "Password = Resend API key (re_…)" },
  { host: "smtp.sendgrid.net", label: "SendGrid", port: "587", hint: "Username 'apikey', password = SG.… key" },
  { host: "smtp-relay.brevo.com", label: "Brevo", port: "587", hint: "Password = Brevo v3 API key (xkeysib-…)" },
  { host: "smtp.postmarkapp.com", label: "Postmark", port: "587", hint: "Password = Server API token" },
  { host: "smtp.mailgun.org", label: "Mailgun", port: "587", hint: "Password = private API key (key-…)" },
  { host: "smtp.mailersend.net", label: "MailerSend", port: "587", hint: "Password = API token" },
];

type FormState = {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  to_emails: string;
  cc_emails: string;
  subject_prefix: string;
  daily_enabled: boolean;
  send_hour_utc: number;
  send_minute_utc: number;
};

const toLocalTime = (h: number, m: number) =>
  `${String((h + 2) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

function SettingsPage() {
  const fetchSettings = useServerFn(getReportSettings);
  const saveSettings = useServerFn(saveReportSettings);
  const runNow = useServerFn(runReportNow);
  const fetchRuns = useServerFn(listReportRuns);
  const qc = useQueryClient();

  const settingsQuery = useQuery({ queryKey: ["report-settings"], queryFn: () => fetchSettings() });
  const runsQuery = useQuery({ queryKey: ["report-runs"], queryFn: () => fetchRuns() });

  const [form, setForm] = useState<FormState | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s || form) return;
    setForm({
      smtp_host: s.smtp_host,
      smtp_port: s.smtp_port,
      smtp_secure: s.smtp_secure,
      smtp_username: s.smtp_username,
      smtp_password: "",
      from_email: s.from_email,
      from_name: s.from_name,
      to_emails: s.to_emails.join(", "),
      cc_emails: s.cc_emails.join(", "),
      subject_prefix: s.subject_prefix,
      daily_enabled: s.daily_enabled,
      send_hour_utc: s.send_hour_utc,
      send_minute_utc: s.send_minute_utc,
    });
  }, [settingsQuery.data, form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Not loaded");
      const split = (v: string) =>
        v
          .split(/[,\s;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      return saveSettings({
        data: {
          smtp_host: form.smtp_host,
          smtp_port: Number(form.smtp_port),
          smtp_secure: form.smtp_secure,
          smtp_username: form.smtp_username,
          smtp_password: form.smtp_password || undefined,
          from_email: form.from_email,
          from_name: form.from_name,
          to_emails: split(form.to_emails),
          cc_emails: split(form.cc_emails),
          subject_prefix: form.subject_prefix,
          daily_enabled: form.daily_enabled,
          send_hour_utc: Number(form.send_hour_utc),
          send_minute_utc: Number(form.send_minute_utc),
        },
      });
    },
    onSuccess: (data) => {
      setMessage({ kind: "ok", text: "Settings saved." });
      setForm((f) => (f ? { ...f, smtp_password: "" } : f));
      qc.setQueryData(["report-settings"], data);
    },
    onError: (error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not save settings." }),
  });

  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (result) => {
      setMessage(
        result.ok
          ? {
              kind: "ok",
              text: `Report sent via ${result.provider} to ${result.recipients?.join(", ")} — ${result.deviceCount} devices.`,
            }
          : { kind: "error", text: result.error ?? "Report failed." },
      );
      void qc.invalidateQueries({ queryKey: ["report-runs"] });
    },
    onError: (error) =>
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Report failed." }),
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <SiteNav />

        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Daily report
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mail server & recipients</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The report runs every day and emails the full fleet table. Enter your normal SMTP
            details below — because this app runs on a serverless edge runtime that cannot open raw
            SMTP sockets, the details are relayed through your provider's HTTPS mail API instead
            (the SMTP password doubles as the API key).
          </p>
        </header>

        {message ? (
          <div
            className={`mb-6 rounded-lg border p-4 text-sm ${
              message.kind === "ok"
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {!form ? (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        ) : (
          <div className="space-y-8">
            <section className="rounded-lg border border-border p-5">
              <h2 className="mb-4 text-lg font-semibold">SMTP / mail server</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="host">SMTP host</Label>
                  <Input
                    id="host"
                    value={form.smtp_host}
                    onChange={(e) => set("smtp_host", e.target.value)}
                    placeholder="smtp.resend.com"
                    className="mt-1.5"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PROVIDER_HINTS.map((p) => (
                      <button
                        key={p.host}
                        type="button"
                        onClick={() => {
                          set("smtp_host", p.host);
                          set("smtp_port", Number(p.port));
                        }}
                        className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={p.hint}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {PROVIDER_HINTS.find((p) => p.host === form.smtp_host)?.hint ??
                      "Pick one of the supported hosts above, or type it in."}
                  </p>
                </div>
                <div>
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={form.smtp_port}
                    onChange={(e) => set("smtp_port", Number(e.target.value))}
                    className="mt-1.5"
                  />
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <Switch
                    id="secure"
                    checked={form.smtp_secure}
                    onCheckedChange={(v) => set("smtp_secure", v)}
                  />
                  <Label htmlFor="secure">Use TLS/SSL (465)</Label>
                </div>
                <div>
                  <Label htmlFor="user">SMTP username</Label>
                  <Input
                    id="user"
                    value={form.smtp_username}
                    onChange={(e) => set("smtp_username", e.target.value)}
                    placeholder="apikey"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="pass">SMTP password / API key</Label>
                  <Input
                    id="pass"
                    type="password"
                    value={form.smtp_password}
                    onChange={(e) => set("smtp_password", e.target.value)}
                    placeholder={
                      settingsQuery.data?.smtp_password_set ? "•••••••• (stored)" : "Enter password"
                    }
                    className="mt-1.5"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Stored server-side only and never sent back to the browser. Leave blank to keep
                    the current value.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border p-5">
              <h2 className="mb-4 text-lg font-semibold">Sender & recipients</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="fromName">Sender name</Label>
                  <Input
                    id="fromName"
                    value={form.from_name}
                    onChange={(e) => set("from_name", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="fromEmail">Sender email</Label>
                  <Input
                    id="fromEmail"
                    value={form.from_email}
                    onChange={(e) => set("from_email", e.target.value)}
                    placeholder="reports@telnetoffice.co.za"
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="to">Recipients (comma separated)</Label>
                  <Textarea
                    id="to"
                    value={form.to_emails}
                    onChange={(e) => set("to_emails", e.target.value)}
                    rows={2}
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="cc">CC (optional)</Label>
                  <Textarea
                    id="cc"
                    value={form.cc_emails}
                    onChange={(e) => set("cc_emails", e.target.value)}
                    rows={2}
                    className="mt-1.5"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="subject">Subject prefix</Label>
                  <Input
                    id="subject"
                    value={form.subject_prefix}
                    onChange={(e) => set("subject_prefix", e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border p-5">
              <h2 className="mb-4 text-lg font-semibold">Daily schedule</h2>
              <div className="flex flex-wrap items-end gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    id="enabled"
                    checked={form.daily_enabled}
                    onCheckedChange={(v) => set("daily_enabled", v)}
                  />
                  <Label htmlFor="enabled">Send the report daily</Label>
                </div>
                <div>
                  <Label htmlFor="hour">Hour (UTC)</Label>
                  <Input
                    id="hour"
                    type="number"
                    min={0}
                    max={23}
                    value={form.send_hour_utc}
                    onChange={(e) => set("send_hour_utc", Number(e.target.value))}
                    className="mt-1.5 w-24"
                  />
                </div>
                <div>
                  <Label htmlFor="minute">Minute</Label>
                  <Input
                    id="minute"
                    type="number"
                    min={0}
                    max={59}
                    value={form.send_minute_utc}
                    onChange={(e) => set("send_minute_utc", Number(e.target.value))}
                    className="mt-1.5 w-24"
                  />
                </div>
                <p className="pb-2 text-sm text-muted-foreground">
                  = {toLocalTime(Number(form.send_hour_utc), Number(form.send_minute_utc))} South
                  African time
                </p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                The scheduler currently fires at 05:00 UTC (07:00 SAST). Changing the time here
                records your preference — tell me the new time and I'll move the schedule.
              </p>
            </section>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
              <Button
                variant="outline"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
              >
                {runMutation.isPending ? "Fetching & sending…" : "Run now (fetch + email)"}
              </Button>
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Recent runs</h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {["When", "Trigger", "Status", "Devices", "Provider", "Detail"].map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(runsQuery.data ?? []).map((run) => (
                      <tr key={run.id} className="border-t border-border">
                        <td className="whitespace-nowrap px-3 py-2">
                          {new Date(run.created_at).toLocaleString("en-ZA")}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{run.triggered_by}</td>
                        <td className="px-3 py-2">
                          <Badge variant={run.status === "sent" ? "default" : "destructive"}>
                            {run.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">{run.device_count ?? "—"}</td>
                        <td className="px-3 py-2">{run.provider ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {run.error ?? run.recipients.join(", ")}
                        </td>
                      </tr>
                    ))}
                    {!(runsQuery.data ?? []).length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                          No report runs yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
