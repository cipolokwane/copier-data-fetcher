import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/snapshots")({
  head: () => ({
    meta: [
      { title: "Meter reading history — Canon fleet" },
      { name: "description", content: "Download the meter readings snapshot for any past date as CSV." },
      { property: "og:title", content: "Meter reading history — Canon fleet" },
      { property: "og:description", content: "Download the meter readings snapshot for any past date as CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SnapshotsPage,
});

const REPO = "cipolokwane/copier-data-fetcher";

function SnapshotsPage() {
  const [date, setDate] = useState("2026-10-15");
  const [csv, setCsv] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true); setCsv(null); setInfo("");
    try {
      const until = `${date}T21:59:59Z`; // end of day, South Africa time
      const r = await fetch(`https://api.github.com/repos/${REPO}/commits?path=data/meters.csv&until=${until}&per_page=1`);
      const commits = await r.json();
      if (!Array.isArray(commits) || !commits.length) throw new Error("No snapshot found for that date.");
      const sha = commits[0].sha;
      const text = await (await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/data/meters.csv`)).text();
      setCsv(text);
      setInfo(`Snapshot taken ${new Date(commits[0].commit.author.date).toLocaleString("en-ZA")} · ${text.trim().split("\n").length - 1} devices`);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : "Could not load snapshot.");
    } finally { setBusy(false); }
  };

  const download = () => {
    if (!csv) return;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `meters_${date}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const rows = csv ? csv.trim().split("\n").map((l) => l.split(",")) : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        <SiteNav />
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Meter reading history</h1>
        <p className="mb-6 text-sm text-muted-foreground">Pick a date to see the last meter readings taken that day, then export them as CSV.</p>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          <Button variant="outline" onClick={load} disabled={busy}>{busy ? "Loading…" : "Show snapshot"}</Button>
          <Button onClick={download} disabled={!csv}>Export CSV</Button>
          <span className="text-sm text-muted-foreground">{info}</span>
        </div>
        {rows.length > 0 && (
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>{(rows[0] ?? []).map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>{rows.slice(1).map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
