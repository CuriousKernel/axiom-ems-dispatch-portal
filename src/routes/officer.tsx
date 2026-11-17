import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  CircleCheck,
  History,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  Timer,
  XCircle,
} from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { MapFrame } from "@/components/axiom/MapFrame";
import { Chip, StatusChip } from "@/components/axiom/StatusChip";
import { EmptyState } from "@/components/axiom/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/axiom/format";
import {
  AMBULANCE,
  DEFAULT_OFFICER_ID,
  MOCK_OFFICER_HISTORY,
  OFFICERS,
  junctionById,
  officerById,
} from "@/lib/axiom/seed";
import { useSimClient } from "@/lib/use-sim-client";
import { AlertState } from "@/lib/alerts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/officer")({
  head: () => ({
    meta: [
      { title: "Officer | Axiom-EMS" },
      { name: "description", content: "Traffic officer screen: receive ambulance alerts for your junction, act and confirm." },
      { property: "og:title", content: "Officer | Axiom-EMS" },
      { property: "og:description", content: "Receive ambulance alerts for your junction, act and confirm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfficerView,
});

type Tab = "now" | "history";

function OfficerView() {
  const [tab, setTab] = useState<Tab>("now");
  const [officerId, setOfficerId] = useState<string>(DEFAULT_OFFICER_ID);

  const officer = officerById(officerId) ?? officerById(DEFAULT_OFFICER_ID)!;
  const junction = junctionById(officer.junctionId)!;
  const { state, connectionState, sendCommand } = useSimClient();

  // Find active alert assigned to this officer or this junction
  const activeAlert = state.alerts.find(
    (a) =>
      (a.officerId === officer.id || a.junctionId === officer.junctionId) &&
      a.state !== AlertState.VERIFIED_CLEAR,
  );

  // Vibration on alert arrival
  const prevAlertId = useRef<string | null>(null);
  useEffect(() => {
    if (activeAlert && activeAlert.id !== prevAlertId.current) {
      prevAlertId.current = activeAlert.id;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          // ignore
        }
      }
    }
  }, [activeAlert]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <Link
          to="/"
          aria-label="Change role"
          className="-ml-2 flex size-12 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <select
              aria-label="Select officer"
              value={officerId}
              onChange={(e) => setOfficerId(e.target.value)}
              className="bg-transparent text-base font-semibold text-foreground focus:outline-none"
            >
              {OFFICERS.map((o) => (
                <option key={o.id} value={o.id} className="bg-popover text-foreground">
                  {o.rank} {o.name}
                </option>
              ))}
            </select>
          </div>
          <p className="truncate text-sm text-muted-foreground">{junction.name}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-clear-ink">
          <span className={cn("size-2.5 rounded-full", officer.online ? "bg-clear" : "bg-muted-foreground")} />
          {officer.online ? "Online" : "Offline"}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === "now" ? (
          activeAlert ? (
            <AlertTakeover
              alert={activeAlert}
              officer={officer}
              state={state}
              sendCommand={sendCommand}
            />
          ) : (
            <NowTab officer={officer} state={state} connectionState={connectionState} />
          )
        ) : (
          <HistoryTab officer={officer} state={state} />
        )}
      </main>

      <AppFooter />

      {/* Bottom tabs, 64px touch targets */}
      <nav className="grid grid-cols-2 border-t bg-card" aria-label="Officer sections">
        {(
          [
            { id: "now", label: "Now", icon: Bell },
            { id: "history", label: "History", icon: History },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              tab === t.id ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-5" aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function AlertTakeover({
  alert,
  officer,
  state,
  sendCommand,
}: {
  alert: typeof useSimClient extends () => { state: infer S } ? S extends { alerts: (infer A)[] } ? A : never : never;
  officer: ReturnType<typeof officerById> extends infer O ? NonNullable<O> : never;
  state: ReturnType<typeof useSimClient>["state"];
  sendCommand: ReturnType<typeof useSimClient>["sendCommand"];
}) {
  const junction = junctionById(alert.junctionId)!;
  const reading = state.readings[alert.junctionId];
  const eta = reading ? reading.eta : 60;
  const queueCount = reading ? reading.vehicleCount : 30;
  const clearTime = reading ? reading.clearTime : 60;

  return (
    <div className="flex flex-col gap-4 bg-critical-soft/30 p-4">
      {/* Critical Banner */}
      <div className="flex items-center justify-between rounded-lg border border-critical bg-critical-soft px-4 py-3 text-critical-ink">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="size-5 text-critical" aria-hidden />
          <span>CRITICAL CORRIDOR ALERT</span>
        </div>
        <StatusChip status="CRITICAL" />
      </div>

      {/* Main Alert Card */}
      <section className="flex flex-col items-center rounded-lg border bg-card px-6 py-6 text-center shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-full bg-critical-soft text-critical animate-pulse">
          <AlertTriangle className="size-7" aria-hidden />
        </span>
        <h1 className="mt-3 text-display font-semibold">{junction.name}</h1>
        <p className="mt-1 text-sm font-medium text-critical-ink">
          Clear corridor lane immediately for approaching ambulance
        </p>

        <div className="mt-6 grid w-full grid-cols-3 gap-2 text-left">
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <dt className="text-xs text-muted-foreground">Ambulance ETA</dt>
            <dd className="tnum mt-0.5 text-title font-semibold text-critical-ink">
              {formatDuration(eta)}
            </dd>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <dt className="text-xs text-muted-foreground">Queue size</dt>
            <dd className="tnum mt-0.5 text-title font-semibold">{queueCount} veh</dd>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <dt className="text-xs text-muted-foreground">Clear time</dt>
            <dd className="tnum mt-0.5 text-title font-semibold">{formatDuration(clearTime)}</dd>
          </div>
        </div>

        <div className="mt-4 w-full border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Current stage: <strong className="uppercase text-foreground">{alert.state.replace(/_/g, " ")}</strong>
          </p>
        </div>
      </section>

      {/* Action Buttons based on Alert State */}
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Officer Action Required
        </p>

        {alert.state === AlertState.SENT && (
          <Button
            size="touch-xl"
            className="w-full bg-critical hover:bg-critical/90 text-white font-semibold text-base"
            onClick={() => {
              sendCommand({
                type: "ACKNOWLEDGE_ALERT",
                alertId: alert.id,
                officerId: officer.id,
              });
            }}
          >
            <CheckCircle2 className="mr-2 size-5" />
            1. Acknowledge Alert
          </Button>
        )}

        {alert.state === AlertState.ACKNOWLEDGED && (
          <Button
            size="touch-xl"
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold text-base"
            onClick={() => {
              sendCommand({
                type: "IN_POSITION",
                alertId: alert.id,
                officerId: officer.id,
              });
            }}
          >
            <ShieldCheck className="mr-2 size-5" />
            2. Mark In Position (Start 3x Clear)
          </Button>
        )}

        {(alert.state === AlertState.IN_POSITION || alert.state === AlertState.CLEARING) && (
          <div className="flex flex-col gap-2">
            <Button
              size="touch-xl"
              className="w-full bg-clear hover:bg-clear/90 text-white font-semibold text-base"
              onClick={() => {
                sendCommand({
                  type: "ROAD_CLEARED",
                  alertId: alert.id,
                  officerId: officer.id,
                });
              }}
            >
              <CheckCircle2 className="mr-2 size-5" />
              3. Road Cleared (Verify)
            </Button>
            <Button
              variant="outline"
              size="touch"
              className="w-full text-critical hover:bg-critical-soft"
              onClick={() => {
                sendCommand({
                  type: "CANT_CLEAR",
                  alertId: alert.id,
                  officerId: officer.id,
                  reason: "Heavy traffic obstruction",
                });
              }}
            >
              <XCircle className="mr-2 size-4" />
              Can't Clear / Request Escalation
            </Button>
          </div>
        )}
      </section>

      {/* Map Context */}
      <section className="overflow-hidden rounded-lg border bg-card">
        <MapFrame
          className="h-44"
          interactive={false}
          showLabels={false}
          junctions={[{ ...junction, status: "CRITICAL" }]}
          officers={[officer]}
          ambulance={{
            lat: state.ambulance.lat,
            lng: state.ambulance.lng,
            heading: state.ambulance.heading,
          }}
          focus={[junction, officer]}
        />
      </section>
    </div>
  );
}

function NowTab({
  officer,
  state,
  connectionState,
}: {
  officer: ReturnType<typeof officerById> extends infer O ? NonNullable<O> : never;
  state: ReturnType<typeof useSimClient>["state"];
  connectionState: ReturnType<typeof useSimClient>["connectionState"];
}) {
  const junction = junctionById(officer.junctionId)!;
  const reading = state.readings[junction.id];
  const eta = reading ? reading.eta : 95;
  const status = reading ? reading.status : "CLEAR";
  const queueCount = reading ? reading.vehicleCount : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <ConnectionChip state={connectionState} />
        <StatusChip status={status} />
      </div>

      <section className="flex flex-col items-center rounded-lg border bg-card px-6 py-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-clear-soft text-clear-ink">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-title font-semibold">All clear</h1>
        <p className="mt-1 text-sm text-muted-foreground">No active alert at {junction.name}.</p>

        <div className="mt-8 w-full border-t pt-6">
          <p className="text-sm text-muted-foreground">Next ambulance on corridor</p>
          <p className="tnum mt-1 text-hero font-semibold tracking-tight">
            {status === "PASSED" ? "PASSED" : formatDuration(eta)}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Timer className="size-4" aria-hidden />
            {AMBULANCE.plate}, {state.driverPriority} {AMBULANCE.caseLabel.toLowerCase()}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <MapFrame
          className="h-44"
          interactive={false}
          showLabels={false}
          junctions={[{ ...junction, status }]}
          officers={[officer]}
          ambulance={{
            lat: state.ambulance.lat,
            lng: state.ambulance.lng,
            heading: state.ambulance.heading,
          }}
          focus={[junction, officer]}
        />
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-muted-foreground">You and {junction.name}</span>
          <Chip tone="neutral" icon={ShieldCheck}>
            Queue {queueCount}
          </Chip>
        </div>
      </section>

      <p className="px-2 text-center text-xs text-muted-foreground">
        You'll get a full-screen alert with sound and vibration automatically when this junction turns critical.
      </p>
    </div>
  );
}

function HistoryTab({
  officer,
  state,
}: {
  officer: ReturnType<typeof officerById> extends infer O ? NonNullable<O> : never;
  state: ReturnType<typeof useSimClient>["state"];
}) {
  const [showAll, setShowAll] = useState(false);

  // Completed alerts for this officer or junction from simulation
  const simHistory = state.alerts
    .filter(
      (a) =>
        (a.officerId === officer.id || a.junctionId === officer.junctionId) &&
        a.state === AlertState.VERIFIED_CLEAR,
    )
    .map((a) => {
      const start = a.transitions[0]?.at ?? a.createdAt;
      const end = a.transitions[a.transitions.length - 1]?.at ?? start;
      const responseSeconds = Math.max(1, Math.round((end - start) / 1000));
      return {
        id: a.id,
        junctionId: a.junctionId,
        date: "Today, simulation run",
        responseSeconds,
        outcome: "Verified clear" as const,
      };
    });

  const items = [...simHistory, ...MOCK_OFFICER_HISTORY];
  const visible = showAll ? items : items.slice(0, 5);
  const avg = items.length
    ? Math.round(items.reduce((a, b) => a + b.responseSeconds, 0) / items.length)
    : 0;

  if (items.length === 0)
    return <EmptyState icon={Inbox} title="No alerts yet" body="Alerts you handle will appear here with response times." />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Average response</p>
        <p className="tnum text-display font-semibold">{avg} s</p>
        <p className="text-xs text-muted-foreground">Across {items.length} corridor alerts</p>
      </section>

      <ul className="divide-y rounded-lg border bg-card">
        {visible.map((h) => (
          <li key={h.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{junctionById(h.junctionId)?.name}</p>
              <p className="text-xs text-muted-foreground">{h.date}</p>
            </div>
            <span className="tnum text-sm font-medium">{h.responseSeconds} s</span>
            <Chip tone={h.outcome === "Verified clear" ? "clear" : "watch"}>{h.outcome}</Chip>
          </li>
        ))}
      </ul>
      {items.length > 5 && !showAll && (
        <Button variant="ghost" size="touch" onClick={() => setShowAll(true)}>
          View all
        </Button>
      )}
    </div>
  );
}
