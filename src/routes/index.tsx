import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getCanonDevices } from "@/lib/canon.functions";
import type { CanonDevice } from "@/lib/canon.server";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canon Copier Fleet | eMaintenance Dashboard" },
      {
        name: "description",
        content:
          "Live Canon eMaintenance fleet view: every copier with model, serial, customer, install date, meter readings and last communication.",
      },
      { property: "og:title", content: "Canon Copier Fleet | eMaintenance Dashboard" },
      {
        property: "og:description",
        content:
          "Every Canon copier in your eMaintenance account with meters, models, serials and customers in one searchable table.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FleetPage,
});

type SortKey =
  | "customerName"
  | "model"
  | "serialNo"
  | "installDate"
  | "lastReceived"
  | "totalCounter";

const num = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-ZA"));

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: "customerName", label: "Customer" },
  { key: null, label: "Customer ID" },
  { key: "model", label: "Model" },
  { key: "serialNo", label: "Serial no." },
  { key: null, label: "Type" },
  { key: "installDate", label: "Installed" },
  { key: "lastReceived", label: "Last comms" },
  { key: "totalCounter", label: "Total (501)", align: "right" },
  { key: null, label: "B/W (113)", align: "right" },
  { key: null, label: "Colour (112)", align: "right" },
  { key: null, label: "Copy B/W (123)", align: "right" },
  { key: null, label: "Copy colour (122)", align: "right" },
  { key: null, label: "RDS version" },
];

function FleetPage() {
  const fetchDevices = useServerFn(getCanonDevices);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["canon-devices"],
    queryFn: () => fetchDevices(),
    staleTime: 5 * 60 * 1000,
  });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "customerName",
    dir: 1,
  });

  const devices = useMemo(() => {
    const rows: CanonDevice[] = data?.devices ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((d) =>
          [d.customerName, d.customerId, d.model, d.serialNo].some((v) =>
            v.toLowerCase().includes(q),
          ),
        )
      : rows;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" || typeof bv === "number") {
        return ((av as number | null) ?? -1) > ((bv as number | null) ?? -1)
          ? sort.dir
          : -sort.dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? "")) * sort.dir;
    });
  }, [data, search, sort]);

  const exportCsv = () => {
    const header = COLUMNS.map((c) => c.label);
    const lines = devices.map((d) => [
      d.customerName,
      d.customerId,
      d.model,
      d.serialNo,
      d.color ? "Colour" : "Mono",
      d.installDate ?? "",
      d.lastReceived ?? "",
      d.totalCounter ?? "",
      d.bwCounter ?? "",
      d.colorCounter ?? "",
      d.copyBw ?? "",
      d.copyColor ?? "",
      d.rdsVersion ?? "",
    ]);
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "canon-copier-fleet.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey | null) => {
    if (!key) return;
    setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Canon eMaintenance
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Copier fleet {data?.distributorName ? `— ${data.distributorName}` : ""}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isLoading
                ? "Signing in to the portal…"
                : `${devices.length} of ${data?.devices.length ?? 0} devices${
                    data?.fetchedAt
                      ? ` · updated ${new Date(data.fetchedAt).toLocaleString("en-ZA")}`
                      : ""
                  }`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, model or serial"
              className="w-72"
            />
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
            <Button onClick={exportCsv} disabled={!devices.length}>
              Export CSV
            </Button>
          </div>
        </header>

        {data && !data.ok ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Could not reach the Canon portal: {"error" in data ? data.error : "unknown error"}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.label}
                      onClick={() => toggleSort(col.key)}
                      className={`whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                        col.align === "right" ? "text-right" : ""
                      } ${col.key ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                    >
                      {col.label}
                      {sort.key === col.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.deviceUniqueId} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">{d.customerName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.customerId}</td>
                    <td className="px-3 py-2">{d.model}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.serialNo}</td>
                    <td className="px-3 py-2">
                      <Badge variant={d.color ? "default" : "secondary"}>
                        {d.color ? "Colour" : "Mono"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{d.installDate ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {d.lastReceived ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{num(d.totalCounter)}</td>
                    <td className="px-3 py-2 text-right">{num(d.bwCounter)}</td>
                    <td className="px-3 py-2 text-right">{num(d.colorCounter)}</td>
                    <td className="px-3 py-2 text-right">{num(d.copyBw)}</td>
                    <td className="px-3 py-2 text-right">{num(d.copyColor)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {d.rdsVersion ?? "—"}
                    </td>
                  </tr>
                ))}
                {!devices.length ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-muted-foreground">
                      No devices match your search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
