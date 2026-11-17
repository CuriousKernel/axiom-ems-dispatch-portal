import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BellOff, Circle, CircleCheck, ScrollText, UserRound, VideoOff } from "lucide-react";
import { ClearTimeChart } from "@/components/axiom/ClearTimeChart";
import { EmptyState } from "@/components/axiom/EmptyState";
import { MapFrame } from "@/components/axiom/MapFrame";
import { SimulatorPanel } from "@/components/axiom/SimulatorPanel";
import { Chip, StatusChip } from "@/components/axiom/StatusChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { corridorWithStatus, ROUTE_PREVIEW } from "@/lib/axiom/corridor";
import { formatDuration, formatSimTime } from "@/lib/axiom/format";
import { ORIGIN, MOCK_EVENTS, OFFICERS, junctionById, officerById, officersAt, readingFor } from "@/lib/axiom/seed";
import { useAxiom } from "@/lib/axiom/store";
import { useSimulator } from "@/lib/simulator-engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/control/")({
  head: () => ({
    meta: [
      { title: "Live corridor | Axiom-EMS Control Room" },
      { name: "description", content: "Live map of the ambulance corridor with junction status, officer positions and the alert queue." },
      { property: "og:title", content: "Live corridor | Axiom-EMS Control Room" },
      { property: "og:description", content: "Live ambulance corridor map, alert queue and junction detail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivePage,
});

function LivePage() {
  const dark = useAxiom((s) => s.controlDark);
  const selected = useAxiom((s) => s.selectedJunctionId);
  const select = useAxiom((s) => s.selectJunction);

  return (
    <>
      <div className="grid grid-cols-[65fr_35fr] gap-4">
        <Card className="relative min-h-[600px] overflow-hidden rounded-lg p-0 shadow-none">
          <MapFrame
            className="absolute inset-0"
            junctions={corridorWithStatus()}
            officers={OFFICERS}
            ambulance={ORIGIN}
            ahead={ROUTE_PREVIEW}
            selectedJunctionId={selected}
            onSelectJunction={select}
            dark={dark}
          />
          <MapLegend />
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <AlertQueue />
          <JunctionDetail />
        </div>
      </div>

      {/* Phase 2: simulator control panel */}
      <SimulatorPanel />

      <EventLog />
    </>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-xs">
      <StatusChip status="CLEAR" />
      <StatusChip status="WATCH" />
      <StatusChip status="CRITICAL" />
      <span className="ml-1 inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="axm-officer inline-block" /> Officer
      </span>
      <span className="text-muted-foreground">Route preview: straight lines (road route in Phase 2)</span>
    </div>
  );
}

function AlertQueue() {
  const select = useAxiom((s) => s.selectJunction);
  const [showAll, setShowAll] = useState(false);

  // Phase 2: use live simulator alerts. Fallback to empty when none yet.
  const simAlerts = useSimulator((s) => s.alerts);
  const alerts = simAlerts;
  const visible = showAll ? alerts : alerts.slice(0, 5);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="text-base font-semibold">Alert queue</CardTitle>
        <span className="tnum text-xs text-muted-foreground">{alerts.length} active</span>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {alerts.length === 0 ? (
          <EmptyState icon={BellOff} title="No active alerts" body="Alerts appear when a junction turns critical." />
        ) : (
          <ul className="flex flex-col">
            {visible.map((a) => {
              const j = junctionById(a.junctionId);
              const o = officerById(a.officerId);
              const liveReading = readingFor(a.junctionId);
              if (!j) return null;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => select(a.junctionId)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-accent"
                  >
                    <StatusChip status={liveReading?.status ?? "CRITICAL"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{j.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {o ? `${o.rank} ${o.name}` : a.officerId} · {a.state.replace(/_/g, " ").toLowerCase()}
                        {a.isLateAlert && (
                          <span className="ml-1 font-medium text-critical-ink">· LATE</span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {alerts.length > 5 && !showAll && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
            View all
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const TIMELINE = [
  { label: "Created", at: 42 },
  { label: "Sent", at: 42 },
  { label: "Acknowledged", at: null },
  { label: "In position", at: null },
  { label: "Verified clear", at: null },
];

function JunctionDetail() {
  const id = useAxiom((s) => s.selectedJunctionId);
  const j = junctionById(id)!;
  const r = readingFor(id)!;

  // Phase 2: check if there's a live simulator alert for this junction
  const simAlerts = useSimulator((s) => s.alerts);
  const liveAlert = simAlerts.find((a) => a.junctionId === id);
  const officer = liveAlert
    ? officerById(liveAlert.officerId)
    : officersAt(id).find((o) => o.online);

  return (
    <Card className="flex-1 rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="text-title font-semibold">{j.name}</CardTitle>
        <StatusChip status={r.status} size="md" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 pb-4">
        <dl className="grid grid-cols-3 gap-2">
          {[
            { k: "Queue", v: `${r.queueCount}` },
            { k: "Clear time", v: formatDuration(r.clearTime) },
            { k: "Ambulance ETA", v: formatDuration(r.eta) },
          ].map((m) => (
            <div key={m.k} className="rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{m.k}</dt>
              <dd className="tnum text-title font-semibold">{m.v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Clear time vs ETA, last 60 s (sample)</p>
          <ClearTimeChart reading={r} />
        </div>

        <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted text-center">
          <VideoOff className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Vision feed offline</p>
          <p className="text-xs text-muted-foreground">
            {j.cameraId ? `Camera ${j.cameraId} connects in Phase 5` : "No camera at this junction"}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
          <UserRound className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm">
            {officer ? `${officer.rank} ${officer.name}` : "No officer online"}
          </span>
          {officer && <Chip tone={officer.online ? "clear" : "neutral"}>{officer.online ? "Online" : "Offline"}</Chip>}
        </div>

        {liveAlert && (
          <ol className="flex flex-col gap-2">
            {TIMELINE.map((step) => (
              <li key={step.label} className="flex items-center gap-2 text-sm">
                {step.at != null ? (
                  <CircleCheck className="size-4 text-primary" aria-hidden />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span className={cn("flex-1", step.at == null && "text-muted-foreground")}>{step.label}</span>
                <span className="tnum text-xs text-muted-foreground">{step.at != null ? formatSimTime(step.at) : "Pending"}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function EventLog() {
  const [showAll, setShowAll] = useState(false);

  // Merge Phase 2 simulator events with Phase 1 mock events.
  const simEvents = useSimulator((s) => s.events);
  const allEvents = [
    ...simEvents.map((e) => ({
      id: e.id,
      t: Math.floor((e.at - Date.now()) / 1000),
      type: e.type as "trip" | "status" | "alert" | "officer" | "system",
      message: e.message,
    })),
    ...MOCK_EVENTS,
  ];

  const visible = showAll ? allEvents : allEvents.slice(0, 5);
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ScrollText className="size-4 text-muted-foreground" aria-hidden />
          Event log
        </CardTitle>
        {allEvents.length > 5 && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show less" : "View all"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <ul className="divide-y">
          {visible.map((e) => (
            <li key={e.id} className="flex items-center gap-4 py-2 text-sm">
              <span className="tnum w-16 shrink-0 text-xs text-muted-foreground">
                {e.t >= 0 ? formatSimTime(e.t) : "now"}
              </span>
              <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{e.type}</span>
              <span className="min-w-0 flex-1 truncate">{e.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
