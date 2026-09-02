import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/api-reference")({
  head: () => ({
    meta: [
      { title: "Canon eMaintenance API Reference | Fleet Dashboard" },
      {
        name: "description",
        content:
          "URLs, endpoints, OAuth scopes and sample code for the Canon eMaintenance (CAMS/RCM) API used to retrieve copier, meter and counter data.",
      },
      { property: "og:title", content: "Canon eMaintenance API Reference | Fleet Dashboard" },
      {
        property: "og:description",
        content:
          "Every host, endpoint, scope and counter ID used to pull Canon copier fleet data, plus copy-paste request examples.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiReferencePage,
});

const HOSTS = [
  { label: "Portal login (browser)", value: "https://www-ec1.srv.ygles.com/ccb/Login" },
  { label: "Identity / token host", value: "https://www-ec1.srv.ygles.com" },
  { label: "RCM data host", value: "https://rcm-ec1.srv.ygles.com" },
  { label: "Distributor tenant ID", value: "611CC" },
];

const ENDPOINTS: {
  method: string;
  path: string;
  host: string;
  scope: string;
  purpose: string;
}[] = [
  {
    method: "POST",
    path: "/ccb/api/identity/login",
    host: "Identity",
    scope: "—  (session cookie)",
    purpose: "Sign in with { display_name, password }. Returns session cookies + redirect_uri.",
  },
  {
    method: "POST",
    path: "/cam/api/v1/token",
    host: "Identity",
    scope: "form field: scope=<scope>",
    purpose: "Exchange the session cookie for a short-lived Bearer access_token for one scope.",
  },
  {
    method: "GET",
    path: "/v1/views/navigations/device-list",
    host: "RCM",
    scope: "RcmViewDeviceRead owner.noRightRequirements",
    purpose: "Paged device list: serial, model, customer, distributor, RDS version, status, colour PPM.",
  },
  {
    method: "POST",
    path: "/v1/meter-readings/billing-meter",
    host: "RCM",
    scope: "RcmMeterBillingRead owner.noRightRequirements",
    purpose: "Billing meters per device. Body: { searchOptions: [{ counterId }] }.",
  },
  {
    method: "GET",
    path: "/v1/parts/{deviceUniqueId}/latest",
    host: "RCM",
    scope: "RcmPartRead owner.noRightRequirements",
    purpose: "Per-device parts: name, part number, counter, lifetime, consumption %, last replaced.",
  },
  {
    method: "GET",
    path: "/v1/parts/latest/monitor",
    host: "RCM",
    scope: "RcmPartRead owner.noRightRequirements",
    purpose: "Fleet-wide parts consumption buckets (80 / 100 / 120 / 150 %).",
  },
  {
    method: "GET",
    path: "/v1/devices/{deviceUniqueId}",
    host: "RCM",
    scope: "RcmViewDeviceRead owner.noRightRequirements",
    purpose: "Full device record including fitted toner types.",
  },
];

const COUNTERS: { id: string; label: string }[] = [
  { id: "501", label: "Total (all prints)" },
  { id: "112", label: "Colour total" },
  { id: "113", label: "Black & white total" },
  { id: "122", label: "Copy — colour" },
  { id: "123", label: "Copy — black & white" },
  { id: "181", label: "Print — total 1" },
  { id: "182", label: "Print — total 2" },
  { id: "183", label: "Print — total 3" },
  { id: "184", label: "Print — total 4" },
  { id: "064", label: "Scan / send" },
  { id: "071", label: "Duplex 1" },
  { id: "072", label: "Duplex 2" },
  { id: "073", label: "Duplex 3" },
  { id: "074", label: "Duplex 4" },
];

const OWN_API = [
  {
    method: "POST",
    path: "/api/public/daily-report",
    purpose:
      "Fetches the fleet from Canon and emails the report. Requires header x-cron-secret: <REPORT_CRON_SECRET>. Called by the daily scheduler; also usable from any external tool.",
  },
];

const CURL_SAMPLE = `# 1. Log in and keep the session cookies
curl -sS -c jar.txt -X POST \\
  'https://www-ec1.srv.ygles.com/ccb/api/identity/login' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Requested-With: XMLHttpRequest' \\
  -d '{"display_name":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'

# 2. Exchange the session for a scoped Bearer token
TOKEN=$(curl -sS -b jar.txt -c jar.txt -X POST \\
  'https://www-ec1.srv.ygles.com/cam/api/v1/token' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  --data-urlencode 'scope=RcmViewDeviceRead owner.noRightRequirements' \\
  | sed -E 's/.*"access_token":"([^"]+)".*/\\1/')

# 3. Read the device list
curl -sS -b jar.txt -H "Authorization: Bearer $TOKEN" \\
  'https://rcm-ec1.srv.ygles.com/v1/views/navigations/device-list?filterBy=distributorTenantId&filterValue=611CC&filterSubValue=&distributorTenantId=611CC&perPage=100&page=1'

# 4. Read billing meters (POST with counter IDs)
METER_TOKEN=$(curl -sS -b jar.txt -c jar.txt -X POST \\
  'https://www-ec1.srv.ygles.com/cam/api/v1/token' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  --data-urlencode 'scope=RcmMeterBillingRead owner.noRightRequirements' \\
  | sed -E 's/.*"access_token":"([^"]+)".*/\\1/')

curl -sS -b jar.txt -H "Authorization: Bearer $METER_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -X POST 'https://rcm-ec1.srv.ygles.com/v1/meter-readings/billing-meter?filterBy=distributorTenantId&filterValue=611CC&filterSubValue=&distributorTenantId=611CC&perPage=100&page=1&isAsync=true' \\
  -d '{"searchOptions":[{"counterId":"501"},{"counterId":"113"},{"counterId":"112"}]}'`;

const TS_SAMPLE = `// Every request must carry the login cookies; tokens are per-scope and short-lived.
const IDENTITY = "https://www-ec1.srv.ygles.com";
const RCM = "https://rcm-ec1.srv.ygles.com";

await fetch(\`\${IDENTITY}/ccb/api/identity/login\`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
  body: JSON.stringify({ display_name: username, password }),
});

const token = await fetch(\`\${IDENTITY}/cam/api/v1/token\`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
  body: new URLSearchParams({ scope: "RcmViewDeviceRead owner.noRightRequirements" }),
}).then((r) => r.json()).then((j) => j.access_token);

const devices = await fetch(
  \`\${RCM}/v1/views/navigations/device-list?filterBy=distributorTenantId&filterValue=611CC&distributorTenantId=611CC&perPage=100&page=1\`,
  { headers: { Authorization: \`Bearer \${token}\`, cookie } },
).then((r) => r.json());`;

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function ApiReferencePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <SiteNav />

        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Integration
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Canon eMaintenance API reference
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Canon does not issue a permanent API key. Authentication is a portal login that returns
            session cookies, which are then exchanged for a short-lived Bearer token per OAuth
            scope. Everything below is what this dashboard uses.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Hosts & identifiers</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {HOSTS.map((h) => (
              <div key={h.label} className="rounded-lg border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{h.label}</p>
                <p className="mt-1 break-all font-mono text-sm">{h.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Endpoints & scopes</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {["Method", "Path", "Host", "OAuth scope", "Returns"].map((h) => (
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
                {ENDPOINTS.map((e) => (
                  <tr key={e.path} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{e.method}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.path}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{e.host}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.scope}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Counter IDs</h2>
          <div className="flex flex-wrap gap-2">
            {COUNTERS.map((c) => (
              <span
                key={c.id}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground"
              >
                <span className="font-mono font-semibold text-foreground">{c.id}</span> · {c.label}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">This app's own endpoint</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {OWN_API.map((e) => (
                  <tr key={e.path} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{e.method}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.path}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The secret is stored server-side and never shown in the browser.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">curl walkthrough</h2>
          <Code>{CURL_SAMPLE}</Code>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">TypeScript / fetch</h2>
          <Code>{TS_SAMPLE}</Code>
          <p className="mt-3 text-xs text-muted-foreground">
            Credentials live only in server-side secrets (CANON_USERNAME, CANON_PASSWORD) and are
            never exposed to the browser.
          </p>
        </section>
      </div>
    </main>
  );
}
