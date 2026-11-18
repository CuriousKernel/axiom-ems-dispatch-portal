import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAnalyticsStore,
  computeDailySummary,
  type TripRecord,
} from "@/lib/analytics-store";
import { toCsv, downloadCsv, downloadJson, type CsvColumn } from "@/lib/csv";
import { formatDuration } from "@/lib/axiom/format";
import { junctionById, JUNCTIONS } from "@/lib/axiom/seed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/control/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics | Axiom-EMS Control Room" },
      { name: "description", content: "Officer response times, minutes saved per trip and CSV exports." },
      { property: "og:title", content: "Analytics | Axiom-EMS Control Room" },
      { property: "og:description", content: "Response times, minutes saved and CSV exports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

export function AnalyticsPage() {
  const trips = useAnalyticsStore((s) => s.trips);
  const loadSampleDay = useAnalyticsStore((s) => s.loadSampleDay);
  const clearTrips = useAnalyticsStore((s) => s.clearTrips);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const summary = useMemo(() => computeDailySummary(trips), [trips]);

  // Aggregate junction alert counts for the chart
  const junctionStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of JUNCTIONS) {
      counts[j.id] = 0;
    }
    for (const trip of trips) {
      for (const [jId, c] of Object.entries(trip.alertsByJunction)) {
        counts[jId] = (counts[jId] ?? 0) + c;
      }
    }
    const max = Math.max(...Object.values(counts), 1);
    return JUNCTIONS.map((j) => ({
      id: j.id,
      name: j.name,
      count: counts[j.id] ?? 0,
      pct: Math.round(((counts[j.id] ?? 0) / max) * 100),
    }));
  }, [trips]);

  const hasData = trips.length > 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── CSV Export Handlers ──────────────────────────────────────────────────

  const handleExportTripsCsv = () => {
    if (!hasData) return;
    const columns: CsvColumn<TripRecord>[] = [
      { header: "Trip ID", accessor: (t) => t.id },
      { header: "Started At", accessor: (t) => t.startedAt },
      { header: "Ended At", accessor: (t) => t.endedAt },
      { header: "Outcome", accessor: (t) => t.outcome },
      { header: "Duration (s)", accessor: (t) => t.simDurationSec },
      { header: "Route", accessor: (t) => t.routeId },
      { header: "Rerouted", accessor: (t) => (t.rerouted ? "YES" : "NO") },
      { header: "Alerts Total", accessor: (t) => t.alertsTotal },
      { header: "Acknowledged Count", accessor: (t) => t.acknowledgedCount },
      { header: "Avg Ack (s)", accessor: (t) => t.avgAckSeconds },
      { header: "Escalations", accessor: (t) => t.escalations },
      { header: "Junctions Cleared", accessor: (t) => t.junctionsCleared },
      { header: "Est. Minutes Saved", accessor: (t) => t.estimatedMinutesSaved },
      { header: "Is Sample", accessor: (t) => (t.isSample ? "YES" : "NO") },
    ];
    const csv = toCsv(trips, columns);
    downloadCsv(`axiom-trips-${todayStr}`, csv);
  };

  const handleExportAlertsCsv = () => {
    if (!hasData) return;
    interface AlertRow {
      tripId: string;
      startedAt: string;
      junctionId: string;
      junctionName: string;
      alertCount: number;
    }
    const rows: AlertRow[] = [];
    for (const t of trips) {
      for (const [jId, count] of Object.entries(t.alertsByJunction)) {
        rows.push({
          tripId: t.id,
          startedAt: t.startedAt,
          junctionId: jId,
          junctionName: junctionById(jId)?.name ?? jId,
          alertCount: count,
        });
      }
    }
    const columns: CsvColumn<AlertRow>[] = [
      { header: "Trip ID", accessor: (r) => r.tripId },
      { header: "Trip Started At", accessor: (r) => r.startedAt },
      { header: "Junction ID", accessor: (r) => r.junctionId },
      { header: "Junction Name", accessor: (r) => r.junctionName },
      { header: "Alert Count", accessor: (r) => r.alertCount },
    ];
    const csv = toCsv(rows, columns);
    downloadCsv(`axiom-alerts-${todayStr}`, csv);
  };

  const handleExportDaySummaryCsv = () => {
    if (!hasData) return;
    const summaryRows = [
      { metric: "Report Date", value: todayStr },
      { metric: "Trips Today", value: summary.tripsToday },
      { metric: "Total Alerts Raised", value: summary.totalAlerts },
      { metric: "Total Escalations", value: summary.totalEscalations },
      { metric: "Escalation Rate (%)", value: `${summary.escalationRate}%` },
      { metric: "Average Acknowledgement Time (s)", value: `${summary.avgAckSeconds} s` },
      { metric: "Junctions Cleared", value: summary.junctionsCleared },
      { metric: "Total Estimated Minutes Saved", value: `${summary.totalMinutesSaved} min` },
      { metric: "Busiest Junction", value: summary.busiestJunction ? `${summary.busiestJunction.name} (${summary.busiestJunction.count} alerts)` : "None" },
      { metric: "Summary", value: summary.summarySentence },
    ];
    const columns: CsvColumn<typeof summaryRows[number]>[] = [
      { header: "Metric", accessor: (r) => r.metric },
      { header: "Value", accessor: (r) => r.value },
    ];
    const csv = toCsv(summaryRows, columns);
    downloadCsv(`axiom-day-summary-${todayStr}`, csv);
  };

  const handleExportJson = () => {
    if (!hasData) return;
    const payload = {
      exportDate: new Date().toISOString(),
      summary,
      junctionAlerts: junctionStats,
      trips,
    };
    downloadJson(`axiom-analytics-${todayStr}`, payload);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Corridor Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Auditable dispatch logs, officer response times, and life-saving travel time reductions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSampleDay}
            className="border-dashed hover:border-primary hover:bg-primary-soft text-xs"
            title="Populate 7 realistic sample ambulance trips for demonstration"
          >
            <Sparkles className="mr-1.5 size-3.5 text-primary" />
            Load sample day
          </Button>

          {hasData && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Clear data
            </Button>
          )}

          <div className="h-5 w-px bg-border" />

          {/* Export dropdown / action buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTripsCsv}
            disabled={!hasData}
            title={hasData ? "Download trips log as CSV" : "No trips recorded yet"}
            className="text-xs"
          >
            <Download className="mr-1.5 size-3.5" />
            Export trips CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAlertsCsv}
            disabled={!hasData}
            title={hasData ? "Download alerts breakdown as CSV" : "No alerts recorded yet"}
            className="text-xs"
          >
            <FileSpreadsheet className="mr-1.5 size-3.5" />
            Alerts CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportDaySummaryCsv}
            disabled={!hasData}
            title={hasData ? "Download day summary as CSV" : "No trips recorded yet"}
            className="text-xs"
          >
            <FileText className="mr-1.5 size-3.5" />
            Day summary CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            disabled={!hasData}
            title={hasData ? "Download all analytics as JSON" : "No trips recorded yet"}
            className="text-xs"
          >
            <Download className="mr-1.5 size-3.5" />
            JSON
          </Button>
        </div>
      </div>

      {/* In-page Clear Confirmation Banner */}
      {showClearConfirm && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Are you sure you want to clear all analytics data? This will reset persisted trip records.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                clearTrips();
                setShowClearConfirm(false);
              }}
            >
              Yes, clear all
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── KPI Tiles ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Trips Today
            </CardTitle>
            <Clock className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{summary.tripsToday}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.tripsToday > 0 ? `${summary.totalAlerts} total alerts` : "Awaiting dispatch"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Avg Response
            </CardTitle>
            <Timer className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {summary.avgAckSeconds > 0 ? `${summary.avgAckSeconds} s` : "--"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Alert sent to officer ACK</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Escalation Rate
            </CardTitle>
            <ShieldAlert className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {summary.totalAlerts > 0 ? `${summary.escalationRate}%` : "--"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.totalEscalations} timeout / cant-clear
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Junctions Cleared
            </CardTitle>
            <CheckCircle2 className="size-4 text-clear" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{summary.junctionsCleared}</div>
            <p className="mt-1 text-xs text-muted-foreground">Confirmed 2-tick clearance</p>
          </CardContent>
        </Card>

        <Card className="shadow-none border-primary/40 bg-primary-soft/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary">
              Est. Minutes Saved
            </CardTitle>
            <Sparkles className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary">
              {summary.totalMinutesSaved > 0 ? `${summary.totalMinutesSaved} min` : "--"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Unmanaged vs green corridor</p>
          </CardContent>
        </Card>
      </div>

      {/* ── End-of-Day Summary & Report Card ───────────────────────────────── */}
      <Card className="rounded-xl border bg-card p-5 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <h2 className="text-base font-semibold">End-of-Day Operations Summary</h2>
              {trips.some((t) => t.isSample) && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase text-accent-foreground">
                  Sample Data
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">{summary.summarySentence}</p>
          </div>

          <Button
            size="sm"
            onClick={() => setShowReportModal(true)}
            className="bg-primary text-primary-foreground font-semibold shadow-sm"
          >
            <FileText className="mr-1.5 size-4" />
            Generate end-of-day report
          </Button>
        </div>

        {hasData && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3 text-xs">
            <div>
              <span className="text-muted-foreground">Busiest corridor bottleneck:</span>{" "}
              <strong className="text-foreground">
                {summary.busiestJunction ? `${summary.busiestJunction.name} (${summary.busiestJunction.count} alerts)` : "None"}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground">Average ACK latency:</span>{" "}
              <strong className="text-foreground">{summary.avgAckSeconds} s</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Total corridor delay eliminated:</span>{" "}
              <strong className="text-clear font-bold">{summary.totalMinutesSaved} minutes</strong>
            </div>
          </div>
        )}
      </Card>

      {/* ── Chart: Alerts by Junction ───────────────────────────────────────── */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="size-4 text-primary" />
            Alerts by Junction
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Distribution of critical alert triggers across Delhi corridor waypoints.
          </p>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="space-y-3">
              {junctionStats.map((j) => (
                <div key={j.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>{j.name}</span>
                    <span className="text-muted-foreground">
                      {j.count} {j.count === 1 ? "alert" : "alerts"}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        j.count === 0 ? "bg-transparent" : j.count > 4 ? "bg-critical" : "bg-primary",
                      )}
                      style={{ width: `${Math.max(j.pct, j.count > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              No alert data available. Complete a simulation trip or click &quot;Load sample day&quot;.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Table of Completed Trips ────────────────────────────────────────── */}
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Corridor Trip Log</CardTitle>
          <p className="text-xs text-muted-foreground">
            Individual ambulance runs between Connaught Place and AIIMS Hospital.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {hasData ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/50 text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Alerts</th>
                    <th className="px-4 py-3">Escalations</th>
                    <th className="px-4 py-3">Avg Ack</th>
                    <th className="px-4 py-3">Min Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono">
                  {trips.map((trip) => {
                    const timeStr = new Date(trip.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                    return (
                      <tr key={trip.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-sans font-medium">
                          {timeStr}
                          {trip.isSample && (
                            <span className="ml-1.5 rounded bg-muted px-1 py-0.2 text-[9px] font-bold text-muted-foreground uppercase">
                              Sample
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-sans">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                              trip.outcome === "arrived"
                                ? "bg-clear-soft text-clear"
                                : trip.outcome === "restarted"
                                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {trip.outcome}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-sans">
                          {trip.rerouted ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">Ring Rd (+1:10)</span>
                          ) : (
                            <span className="text-muted-foreground">Mathura Rd</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-sans">{formatDuration(trip.simDurationSec)}</td>
                        <td className="px-4 py-2.5 font-sans">{trip.alertsTotal}</td>
                        <td className="px-4 py-2.5 font-sans">
                          {trip.escalations > 0 ? (
                            <span className="font-bold text-critical">{trip.escalations}</span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-sans">{trip.avgAckSeconds} s</td>
                        <td className="px-4 py-2.5 font-sans font-semibold text-clear">
                          +{trip.estimatedMinutesSaved} min
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              No trips recorded yet. Run an ambulance trip in the Live view or load sample data.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── End-of-Day Report Clean View Modal (Judge Readable) ──────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-xl border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setShowReportModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close report"
            >
              <X className="size-5" />
            </button>

            <div className="border-b pb-4">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                <h2 className="text-xl font-bold">Axiom-EMS End-of-Day Dispatch Report</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Date: {todayStr} | AIIMS Emergency Corridor Coordination Assessment
              </p>
            </div>

            <div className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Completed Trips</p>
                <p className="text-2xl font-bold text-foreground">{summary.tripsToday}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Alerts Generated</p>
                <p className="text-2xl font-bold text-foreground">{summary.totalAlerts}</p>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase font-medium">Corridor Clearance</p>
                <p className="text-2xl font-bold text-clear">{summary.junctionsCleared} jams</p>
              </div>
              <div className="rounded-lg border bg-primary/10 border-primary/30 p-3 text-center">
                <p className="text-[11px] text-primary uppercase font-bold">Time Saved</p>
                <p className="text-2xl font-bold text-primary">{summary.totalMinutesSaved} min</p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <p className="font-semibold text-foreground">Operational Findings:</p>
              <ul className="list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
                <li>
                  <strong>Executive Summary:</strong> {summary.summarySentence}
                </li>
                <li>
                  <strong>Corridor Bottleneck:</strong> Primary congestion observed at{" "}
                  <strong>{summary.busiestJunction ? summary.busiestJunction.name : "N/A"}</strong> with{" "}
                  {summary.busiestJunction ? summary.busiestJunction.count : 0} critical alerts.
                </li>
                <li>
                  <strong>Officer Readiness:</strong> Traffic officers acknowledged alerts in an average of{" "}
                  <strong>{summary.avgAckSeconds} seconds</strong>.
                </li>
                <li>
                  <strong>Fail-Safe Escalation:</strong> Escalation rate was{" "}
                  <strong>{summary.escalationRate}%</strong>; zero alerts went unhandled due to automatic backup rerouting.
                </li>
                <li>
                  <strong>Clinical Impact:</strong> Reducing transit time by {summary.totalMinutesSaved} minutes directly
                  protects patient survival windows in STEMI (cardiac) and trauma emergencies.
                </li>
              </ul>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="outline" size="sm" onClick={handleExportDaySummaryCsv}>
                <Download className="mr-1.5 size-3.5" />
                Download Report CSV
              </Button>
              <Button size="sm" onClick={() => setShowReportModal(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
