import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, FileClock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/site-nav";
import { getMeterHistory, getMeterHistoryCsv, getMeterSnapshot } from "@/lib/history.functions";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Historical Meter Reports | Canon Fleet Dashboard" },
      {
        name: "description",
        content: "Browse previous hourly Canon meter snapshots by date, inspect device readings, and export selected snapshots as CSV.",
      },
      { property: "og:title", content: "Historical Meter Reports | Canon Fleet Dashboard" },
      {
        property: "og:description",
        content: "Select a date range to review and export previous hourly copier meter snapshots.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

type DateRange = { from: string; to: string };

function initialRange(): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const formatSnapshotDate = (date: string) =>
  new Date(date).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  });

const number = (value: number) => value.toLocaleString("en-ZA");

function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type PreparedRangeExport = {
  csv: string;
  snapshotCount: number;
  deviceRowCount: number;
  from: string;
  to: string;
};

function HistoryPage() {
  const loadHistory = useServerFn(getMeterHistory);
  const loadSnapshot = useServerFn(getMeterSnapshot);
  const loadHistoryCsv = useServerFn(getMeterHistoryCsv);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [selectedSha, setSelectedSha] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [preparedExport, setPreparedExport] = useState<PreparedRangeExport | null>(null);
  const [exportError, setExportError] = useState("");
  const [isPreparingExport, setIsPreparingExport] = useState(false);

  const historyQuery = useQuery({
    queryKey: ["meter-history", range.from, range.to],
    queryFn: () => loadHistory({ data: range }),
  });
  const snapshotQuery = useQuery({
    queryKey: ["meter-history-snapshot", selectedSha],
    queryFn: () => loadSnapshot({ data: { sha: selectedSha } }),
    enabled: Boolean(selectedSha),
    staleTime: Infinity,
  });

  const snapshots = historyQuery.data?.ok ? historyQuery.data.commits : [];
  const selectedCommit = snapshots.find((snapshot) => snapshot.sha === selectedSha);
  const selectedSnapshot = snapshotQuery.data?.ok ? snapshotQuery.data : null;
  const totalPages = selectedSnapshot?.rows.reduce(
    (sum, row) => sum + row.a4_mono + row.a4_colour + row.a3_mono + row.a3_colour,
    0,
  ) ?? 0;

  const applyDateRange = () => {
    if (!from || !to) {
      setRangeError("Choose both dates.");
      return;
    }
    if (from > to) {
      setRangeError("The start date must be on or before the end date.");
      return;
    }
    setRangeError("");
    setSelectedSha("");
    setPreparedExport(null);
    setExportError("");
    setRange({ from, to });
  };

  const prepareRangeExport = async () => {
    setIsPreparingExport(true);
    setExportError("");
    setPreparedExport(null);
    try {
      const result = await loadHistoryCsv({ data: range });
      if (!result.ok) {
        setExportError(result.error);
        return;
      }
      setPreparedExport({ ...result, from: range.from, to: range.to });
    } catch {
      setExportError("Could not prepare the historical CSV. Please try a smaller date range.");
    } finally {
      setIsPreparingExport(false);
    }
  };

  const exportSnapshot = () => {
    const csv = selectedSnapshot?.csv;
    if (!csv || !selectedCommit) return;
    downloadCsv(csv, `canon-meter-snapshot-${selectedCommit.date.slice(0, 10)}-${selectedCommit.sha.slice(0, 7)}.csv`);
  };

  const downloadRangeExport = () => {
    if (!preparedExport) return;
    downloadCsv(preparedExport.csv, `canon-meter-history-${preparedExport.from}-to-${preparedExport.to}.csv`);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        <SiteNav />
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Canon eMaintenance
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Historical meter reports</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review an earlier hourly snapshot and export its original CSV.
            </p>
          </div>
          <FileClock className="mb-1 size-8 text-muted-foreground" aria-hidden="true" />
        </header>

        <section className="mb-8 border-b border-border pb-6" aria-label="Snapshot date range">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">From</span>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <Button onClick={applyDateRange} disabled={historyQuery.isFetching}>
              {historyQuery.isFetching ? "Loading…" : "Show snapshots"}
            </Button>
          </div>
          {rangeError ? <p className="mt-2 text-sm text-destructive">{rangeError}</p> : null}
        </section>

        {historyQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
          </div>
        ) : historyQuery.data && !historyQuery.data.ok ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {historyQuery.data.error}
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Snapshots ({snapshots.length})</h2>
              <div className="flex flex-wrap items-center gap-2">
                {preparedExport?.from === range.from && preparedExport.to === range.to ? (
                  <Button variant="outline" onClick={downloadRangeExport}>
                    <Download aria-hidden="true" />
                    Download date-range CSV
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={prepareRangeExport}
                    disabled={!snapshots.length || historyQuery.isFetching || Boolean(historyQuery.data?.truncated) || isPreparingExport}
                  >
                    <FileText aria-hidden="true" />
                    {isPreparingExport ? "Preparing CSV…" : "Prepare date-range CSV"}
                  </Button>
                )}
              </div>
              {historyQuery.data?.truncated ? (
                <p className="text-sm text-muted-foreground">Showing the newest 2,000 snapshots; narrow the date range to see fewer.</p>
              ) : null}
            </div>
            {preparedExport?.from === range.from && preparedExport.to === range.to ? (
              <p className="mb-3 text-sm text-muted-foreground" role="status">
                CSV ready · {number(preparedExport.snapshotCount)} snapshots · {number(preparedExport.deviceRowCount)} device readings
              </p>
            ) : null}
            {exportError ? <p className="mb-3 text-sm text-destructive" role="alert">{exportError}</p> : null}
            <div className="max-h-[430px] overflow-auto rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Snapshot time</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Update</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr key={snapshot.sha} className="border-t border-border hover:bg-muted/40">
                      <td className="whitespace-nowrap px-3 py-2">{formatSnapshotDate(snapshot.date)}</td>
                      <td className="max-w-[36rem] truncate px-3 py-2 text-muted-foreground">
                        {snapshot.message.split("\n")[0]}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant={selectedSha === snapshot.sha ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => setSelectedSha(snapshot.sha)}
                          aria-pressed={selectedSha === snapshot.sha}
                        >
                          <FileText aria-hidden="true" />
                          {selectedSha === snapshot.sha ? "Selected" : "View"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!snapshots.length ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-10 text-center text-muted-foreground">
                        No snapshots were found for these dates.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {selectedSha ? (
              <section className="mt-8" aria-label="Selected meter snapshot">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Selected snapshot</p>
                    <h2 className="mt-1 text-xl font-semibold">
                      {selectedCommit ? formatSnapshotDate(selectedCommit.date) : "Loading snapshot…"}
                    </h2>
                    {selectedSnapshot ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedSnapshot.rows.length} devices · {number(totalPages)} total printed pages
                      </p>
                    ) : null}
                  </div>
                  <Button onClick={exportSnapshot} disabled={!selectedSnapshot}>
                    <Download aria-hidden="true" />
                    Export CSV
                  </Button>
                </div>

                {snapshotQuery.isFetching ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
                  </div>
                ) : snapshotQuery.data && !snapshotQuery.data.ok ? (
                  <p className="text-sm text-destructive">{snapshotQuery.data.error}</p>
                ) : selectedSnapshot ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          {["Serial no.", "Model", "Customer", "A4 mono", "A4 colour", "A3 mono", "A3 colour", "Scans", "Reading date"].map((heading) => (
                            <th key={heading} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">{heading}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSnapshot.rows.map((row) => (
                          <tr key={row.serial_number} className="border-t border-border hover:bg-muted/40">
                            <td className="px-3 py-2 font-mono text-xs">{row.serial_number}</td>
                            <td className="px-3 py-2">{row.device_model}</td>
                            <td className="px-3 py-2">{row.customer_name}</td>
                            <td className="px-3 py-2 text-right">{number(row.a4_mono)}</td>
                            <td className="px-3 py-2 text-right">{number(row.a4_colour)}</td>
                            <td className="px-3 py-2 text-right">{number(row.a3_mono)}</td>
                            <td className="px-3 py-2 text-right">{number(row.a3_colour)}</td>
                            <td className="px-3 py-2 text-right">{number(row.scans)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{row.reading_date || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}