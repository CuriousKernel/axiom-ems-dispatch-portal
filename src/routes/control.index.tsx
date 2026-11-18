import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BellOff,
  Circle,
  CircleCheck,
  Clock,
  Play,
  ScrollText,
  UserCheck,
  UserRound,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";
import { ClearTimeChart } from "@/components/axiom/ClearTimeChart";
import { EmptyState } from "@/components/axiom/EmptyState";
import { MapFrame } from "@/components/axiom/MapFrame";
import { Chip, StatusChip } from "@/components/axiom/StatusChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatSimTime } from "@/lib/axiom/format";
import { JUNCTIONS, OFFICERS, junctionById, officerById, officersAt, readingFor } from "@/lib/axiom/seed";
import { useAxiom } from "@/lib/axiom/store";
import { useSimulator, formatOfficerName } from "@/lib/simulator-engine";
import { AlertState, isActiveAlert } from "@/lib/alerts";
import { PRIMARY_ROUTE, ALT_ROUTE, routeIsSynthetic } from "@/lib/route-data";
import type { JunctionStatus, LatLng } from "@/lib/axiom/types";
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
  const selected = useAxiom((s) => s.selectedJunctionId);
  const select = useAxiom((s) => s.selectJunction);

  const ambulance = useSimulator((s) => s.ambulance);
  const readings = useSimulator((s) => s.readings);
  const activeRouteId = useSimulator((s) => s.activeRouteId);
  const startTrip = useSimulator((s) => s.startTrip);

  // Compute live junctions with dynamic status
  const liveJunctions = useMemo(() => {
    return JUNCTIONS.map((j) => {
      const r = readings[j.id];
      const status: JunctionStatus = r ? r.status : "CLEAR";
      return {
        ...j,
        status,
      };
    });
  }, [readings]);

  // Split active route into traveled (green) and ahead (gray)
  const { traveled, ahead } = useMemo(() => {
    const activeRoute = activeRouteId === "alt" ? ALT_ROUTE : PRIMARY_ROUTE;
    const currentDist = ambulance.distanceMeters;
    const trav: LatLng[] = [];
    const ah: LatLng[] = [];

    for (const pt of activeRoute.points) {
      if (pt.cumulativeDistanceMeters <= currentDist) {
        trav.push({ lat: pt.lat, lng: pt.lng });
      } else {
        ah.push({ lat: pt.lat, lng: pt.lng });
      }
    }

    // Connect them at the ambulance position
    if (trav.length > 0 && ah.length > 0) {
      trav.push({ lat: ambulance.lat, lng: ambulance.lng });
      ah.unshift({ lat: ambulance.lat, lng: ambulance.lng });
    }

    return { traveled: trav, ahead: ah };
  }, [activeRouteId, ambulance.distanceMeters, ambulance.lat, ambulance.lng]);

  return (
    <>
      {/* Synthetic route warning banner */}
      {routeIsSynthetic && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-yellow-400/50 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-300">
          <span className="font-semibold">⚠ Straight-line placeholder route.</span>
          <span>Run <code className="rounded bg-yellow-900/20 px-1 font-mono text-xs">npm run fetch-route</code> to load the real OSRM road geometry.</span>
        </div>
      )}

      {/* When idle: friendly prompt banner */}
      {ambulance.status === "idle" && (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary-soft/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs">
              1
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Ambulance ready at Connaught Place</p>
              <p className="text-xs text-muted-foreground">
                Press "Start trip" above or below to begin corridor simulation.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={startTrip} className="gap-1.5 text-xs font-semibold">
            <Play className="size-3.5" />
            Start trip
          </Button>
        </div>
      )}

      {/* Main 2-column layout: Big Map Left, Alert/Junction Right */}
      <div className="grid grid-cols-[60fr_40fr] gap-4">
        <Card className="relative min-h-[640px] overflow-hidden rounded-lg p-0 shadow-none">
          <MapFrame
            className="absolute inset-0"
            junctions={liveJunctions}
            officers={OFFICERS}
            ambulance={{
              lat: ambulance.lat,
              lng: ambulance.lng,
              heading: ambulance.heading,
            }}
            traveled={traveled}
            ahead={ahead}
            selectedJunctionId={selected}
            onSelectJunction={select}
            dark={false}
          />
          <MapLegend />
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <AlertQueue />
          <JunctionDetail />
        </div>
      </div>

      {/* Officer Roster & Event Log */}
      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <OfficerRoster />
        <EventLog />
      </div>
    </>
  );
}

function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-xs">
      <StatusChip status="CLEAR" />
      <StatusChip status="WATCH" />
      <StatusChip status="CRITICAL" />
      <StatusChip status="PASSED" />
      <span className="ml-1 inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="axm-officer inline-block" /> Officer
      </span>
      <span className="text-muted-foreground">Connaught Place → AIIMS</span>
    </div>
  );
}

function AlertQueue() {
  const select = useAxiom((s) => s.selectedJunctionId);
  const selectJunction = useAxiom((s) => s.selectJunction);
  const [showAll, setShowAll] = useState(false);

  const alerts = useSimulator((s) => s.alerts);
  const readings = useSimulator((s) => s.readings);
  const acknowledgeAlert = useSimulator((s) => s.acknowledgeAlert);
  const activeAlerts = alerts.filter(isActiveAlert);
  const visible = showAll ? activeAlerts : activeAlerts.slice(0, 5);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="text-base font-semibold">Active Alerts</CardTitle>
        <span className="tnum text-xs font-semibold text-muted-foreground">{activeAlerts.length} active</span>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {activeAlerts.length === 0 ? (
          <EmptyState icon={BellOff} title="No active alerts" body="Alerts appear when a junction turns critical along the route." />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((a) => {
              const j = junctionById(a.junctionId);
              const o = officerById(a.officerId);
              const reading = readings[a.junctionId];
              if (!j) return null;

              // Readable step name
              let stepName = "Alert Sent";
              if (a.state === AlertState.ACKNOWLEDGED) stepName = "Acknowledged";
              else if (a.state === AlertState.IN_POSITION) stepName = "In Position (Draining)";
              else if (a.state === AlertState.CLEARING) stepName = "Clearing (Verifying)";
              else if (a.state === AlertState.VERIFIED_CLEAR) stepName = "Verified Clear";
              else if (a.state === AlertState.NOT_CLEARED) stepName = "Escalated";
              else if (a.state === AlertState.ESCALATED_FINAL) stepName = "No Officers — Call Required";

              // Escalation chain: [First Officer] -> [Second Officer] -> Duty Inspector
              const chain: { id: string; name: string; isCurrent: boolean }[] = [];
              if (a.escalatedFrom && a.escalatedFrom !== a.officerId) {
                chain.push({
                  id: a.escalatedFrom,
                  name: formatOfficerName(a.escalatedFrom),
                  isCurrent: false,
                });
              }
              chain.push({
                id: a.officerId,
                name: formatOfficerName(a.officerId),
                isCurrent: true,
              });
              if (a.officerId !== "control-room") {
                chain.push({
                  id: "control-room",
                  name: "Duty Inspector",
                  isCurrent: false,
                });
              }

              return (
                <li
                  key={a.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors cursor-pointer",
                    select === a.junctionId ? "bg-muted/60 border-primary/40" : "bg-card hover:bg-muted/30",
                  )}
                  onClick={() => selectJunction(a.junctionId)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusChip status={reading?.status ?? "CRITICAL"} size="sm" />
                        <span className="font-bold text-sm">
                          {j.name} → {o ? `${o.rank} ${o.name}` : formatOfficerName(a.officerId)}
                        </span>
                        {a.isLateAlert && (
                          <span className="rounded bg-critical-soft px-1.5 py-0.2 text-[10px] font-bold text-critical-ink">
                            LATE ALERT
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Step: <strong className="text-foreground">{stepName}</strong>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-bold uppercase text-foreground">
                        {a.state.replace(/_/g, " ")}
                      </span>
                      {a.state === AlertState.SENT && a.escalatesIn !== undefined && (
                        <span className="tnum flex items-center gap-1 text-[11px] font-bold text-critical">
                          <Clock className="size-3 animate-spin" />
                          ⏱ {a.escalatesIn}s left to ACK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Escalation chain display */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground border-t pt-2">
                    <span className="font-medium">Escalation chain:</span>
                    {chain.map((c, i) => (
                      <span key={c.id} className="inline-flex items-center gap-1">
                        {i > 0 && <span>→</span>}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-medium",
                            c.isCurrent
                              ? "bg-primary-soft text-primary font-bold border border-primary/30"
                              : "text-muted-foreground",
                          )}
                        >
                          {c.name}
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Judge-Demo Controls */}
                  {a.state === AlertState.SENT && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2 text-xs">
                      <span className="font-extrabold text-[10px] uppercase tracking-wider text-muted-foreground">
                        Judge Demo:
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeAlert(a.id, a.officerId);
                        }}
                      >
                        Simulate: officer acknowledges
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          toast("Simulating ignore: let countdown expire to observe auto-escalation");
                        }}
                      >
                        Simulate: officer ignores
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {activeAlerts.length > 5 && !showAll && (
          <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setShowAll(true)}>
            View all
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OfficerRoster() {
  const alerts = useSimulator((s) => s.alerts);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <UserCheck className="size-4 text-muted-foreground" aria-hidden />
            Officer Roster & Status
          </CardTitle>
          <p className="text-xs text-muted-foreground">Live deployment status along corridor</p>
        </div>
        <span className="tnum text-xs font-semibold text-muted-foreground">{OFFICERS.length} officers</span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-2.5">
          {OFFICERS.map((o) => {
            const j = junctionById(o.junctionId);
            const activeAlert = alerts.find(
              (a) => a.officerId === o.id && isActiveAlert(a),
            );
            const timedOutAlert = alerts.find(
              (a) =>
                a.previousOfficerId === o.id &&
                a.officerId !== o.id &&
                isActiveAlert(a),
            );

            // Status badge logic: STANDBY / ALERTED / ACKNOWLEDGED / IN POSITION / NO RESPONSE / ESCALATED
            let badgeLabel = "STANDBY";
            let badgeClass = "bg-muted text-muted-foreground";

            if (activeAlert) {
              if (activeAlert.state === AlertState.SENT) {
                badgeLabel = "ALERTED";
                badgeClass = "bg-critical text-white font-bold animate-pulse";
              } else if (activeAlert.state === AlertState.ACKNOWLEDGED) {
                badgeLabel = "ACKNOWLEDGED";
                badgeClass = "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/40";
              } else if (
                activeAlert.state === AlertState.IN_POSITION ||
                activeAlert.state === AlertState.CLEARING
              ) {
                badgeLabel = "IN POSITION";
                badgeClass = "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/40";
              } else if (activeAlert.state === AlertState.NOT_CLEARED) {
                badgeLabel = "ESCALATED";
                badgeClass = "bg-critical-soft text-critical-ink font-bold";
              }
            } else if (timedOutAlert) {
              badgeLabel = "NO RESPONSE";
              badgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30";
            }

            return (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-lg border p-2.5 bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs truncate">
                      {o.rank} {o.name}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">({o.id.toUpperCase()})</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{j?.name}</p>
                </div>

                <span className={cn("rounded px-2 py-0.5 text-[10px] uppercase tracking-wider", badgeClass)}>
                  {badgeLabel}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function JunctionDetail() {
  const id = useAxiom((s) => s.selectedJunctionId);
  const j = junctionById(id)!;
  const liveReadings = useSimulator((s) => s.readings);
  const liveReading = liveReadings[id];

  // Fallback to static seed reading if engine hasn't populated yet
  const staticFallback = readingFor(id)!;
  const r = liveReading
    ? {
        junctionId: id,
        queueCount: liveReading.vehicleCount,
        clearTime: liveReading.clearTime,
        eta: liveReading.eta,
        status: liveReading.status,
        source: "simulator" as const,
      }
    : staticFallback;

  const simAlerts = useSimulator((s) => s.alerts);
  const liveAlert = simAlerts.find((a) => a.junctionId === id);
  const officer = liveAlert
    ? officerById(liveAlert.officerId)
    : officersAt(id).find((o) => o.online);

  // Build timeline from transitions if liveAlert exists
  const timeline = useMemo(() => {
    if (!liveAlert) return [];
    return [
      {
        label: "Created",
        at: liveAlert.transitions.find((t) => t.to === "CREATED")?.at ?? liveAlert.createdAt,
      },
      {
        label: "Sent",
        at: liveAlert.transitions.find((t) => t.to === "SENT")?.at ?? null,
      },
      {
        label: "Acknowledged",
        at: liveAlert.transitions.find((t) => t.to === "ACKNOWLEDGED")?.at ?? null,
      },
      {
        label: "In position",
        at: liveAlert.transitions.find((t) => t.to === "IN_POSITION")?.at ?? null,
      },
      {
        label: "Verified clear",
        at: liveAlert.transitions.find((t) => t.to === "VERIFIED_CLEAR")?.at ?? null,
      },
    ];
  }, [liveAlert]);

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
            { k: "Ambulance ETA", v: r.status === "PASSED" ? "PASSED" : formatDuration(r.eta) },
          ].map((m) => (
            <div key={m.k} className="rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{m.k}</dt>
              <dd className="tnum text-title font-semibold">{m.v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Clear time vs ETA, last 60 s</p>
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
          <span className="flex-1 text-sm font-semibold">
            {officer ? `${officer.rank} ${officer.name}` : "No officer online"}
          </span>
          {officer && <Chip tone={officer.online ? "clear" : "neutral"}>{officer.online ? "Online" : "Offline"}</Chip>}
        </div>

        {liveAlert && (
          <ol className="flex flex-col gap-2">
            {timeline.map((step) => (
              <li key={step.label} className="flex items-center gap-2 text-sm">
                {step.at != null ? (
                  <CircleCheck className="size-4 text-primary" aria-hidden />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span className={cn("flex-1", step.at == null && "text-muted-foreground")}>{step.label}</span>
                <span className="tnum text-xs text-muted-foreground">
                  {step.at != null ? "Done" : "Pending"}
                </span>
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
  const events = useSimulator((s) => s.events);

  const visible = showAll ? events : events.slice(0, 5);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ScrollText className="size-4 text-muted-foreground" aria-hidden />
          Event log
        </CardTitle>
        {events.length > 5 && (
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
                {e.at >= 0 ? formatSimTime(Math.round(e.at)) : "now"}
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
