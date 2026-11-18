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
  Radio,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Volume2,
  VolumeX,
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
import { AlertState, type AlertRecord } from "@/lib/alerts";
import { formatOfficerName } from "@/lib/simulator-engine";
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

function playAlertBeep() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio context may be restricted before user gesture
  }
}

function OfficerView() {
  const [tab, setTab] = useState<Tab>("now");
  const [officerId, setOfficerId] = useState<string>(DEFAULT_OFFICER_ID);
  const [followAlert, setFollowAlert] = useState<boolean>(true); // Demo: follow active alert (default ON)
  const [isEmbedded, setIsEmbedded] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Parse embed & follow query parameters from URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("embed") === "1") setIsEmbedded(true);
      if (params.get("follow") === "0") setFollowAlert(false);
    }
  }, []);

  const { state, connectionState, isStale, sendCommand } = useSimClient();

  // Find most recent active alert across corridor
  const activeCorridorAlert = state.alerts.find((a) => a.state !== AlertState.VERIFIED_CLEAR);

  // Auto-follow: if enabled and an alert is active, automatically select that officer!
  useEffect(() => {
    if (followAlert && activeCorridorAlert && activeCorridorAlert.officerId !== "control-room") {
      setOfficerId(activeCorridorAlert.officerId);
    }
  }, [followAlert, activeCorridorAlert?.id, activeCorridorAlert?.officerId]);

  const officer = officerById(officerId) ?? officerById(DEFAULT_OFFICER_ID)!;
  const junction = junctionById(officer.junctionId)!;

  // Active alert currently assigned to this officer
  const myActiveAlert = state.alerts.find(
    (a) => a.officerId === officer.id && a.state !== AlertState.VERIFIED_CLEAR,
  );

  // Escalated alert previously assigned to this officer (timed-out or couldn't clear)
  const escalatedFromMeAlert = state.alerts.find(
    (a) =>
      (a.previousOfficerId === officer.id || a.escalatedFrom === officer.id) &&
      a.officerId !== officer.id &&
      a.state !== AlertState.VERIFIED_CLEAR,
  );

  // Vibration & sound on alert arrival
  const prevAlertId = useRef<string | null>(null);
  useEffect(() => {
    if (myActiveAlert && myActiveAlert.id !== prevAlertId.current) {
      prevAlertId.current = myActiveAlert.id;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([200, 100, 200, 100, 300]);
        } catch {
          // ignore
        }
      }
      if (soundEnabled) {
        playAlertBeep();
      }
    }
  }, [myActiveAlert, soundEnabled]);

  return (
    <div className={cn("mx-auto flex min-h-dvh w-full max-w-[420px] flex-col bg-background", isEmbedded && "min-h-full")}>
      {/* Big Always-Visible Identity Header */}
      <header className="flex flex-col border-b bg-card px-4 py-3 gap-2">
        <div className="flex items-center justify-between">
          {!isEmbedded && (
            <Link
              to="/"
              aria-label="Change role"
              className="-ml-2 flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            >
              <ArrowLeft className="size-4" />
            </Link>
          )}
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              ON DUTY
            </span>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {officer.id.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Enable sound button */}
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playAlertBeep();
              }}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors border",
                soundEnabled
                  ? "bg-primary-soft text-primary border-primary/30"
                  : "bg-muted text-muted-foreground border-border hover:text-foreground",
              )}
              title={soundEnabled ? "Sound enabled" : "Enable sound alerts"}
            >
              {soundEnabled ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
              {soundEnabled ? "Sound on" : "Enable sound"}
            </button>
            <ConnectionChip state={connectionState} stale={isStale} />
          </div>
        </div>

        {/* Identity Details & Demo Selector */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Select officer"
                value={officerId}
                onChange={(e) => {
                  setOfficerId(e.target.value);
                  setFollowAlert(false); // Manually selecting disables auto-follow
                }}
                className="bg-transparent text-sm font-bold text-foreground focus:outline-none"
              >
                {OFFICERS.map((o) => (
                  <option key={o.id} value={o.id} className="bg-popover text-foreground">
                    {o.rank} {o.name} ({junctionById(o.junctionId)?.name})
                  </option>
                ))}
              </select>
            </div>
            <p className="truncate text-xs text-muted-foreground">Assigned: {junction.name}</p>
          </div>

          {/* Follow Active Alert Toggle */}
          <button
            type="button"
            onClick={() => setFollowAlert((v) => !v)}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-semibold transition-colors border",
              followAlert
                ? "bg-primary-soft text-primary border-primary/30"
                : "bg-muted text-muted-foreground border-border",
            )}
            title="Auto-selects the officer who holds the active alert"
          >
            Auto-follow {followAlert ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {tab === "now" ? (
          myActiveAlert ? (
            <AlertTakeover
              alert={myActiveAlert}
              officer={officer}
              state={state}
              sendCommand={sendCommand}
            />
          ) : (
            <NowTab
              officer={officer}
              state={state}
              connectionState={connectionState}
              isStale={isStale}
              escalatedAlert={escalatedFromMeAlert}
            />
          )
        ) : (
          <HistoryTab officer={officer} state={state} />
        )}
      </main>

      {!isEmbedded && <AppFooter />}

      {/* Bottom tabs */}
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
              "flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              tab === t.id ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── Active Alert Takeover (Full-Screen Emergency UI) ───────────────────────

function AlertTakeover({
  alert,
  officer,
  state,
  sendCommand,
}: {
  alert: typeof useSimClient extends () => { state: infer S } ? (S extends { alerts: (infer A)[] } ? A : never) : never;
  officer: ReturnType<typeof officerById> extends infer O ? NonNullable<O> : never;
  state: ReturnType<typeof useSimClient>["state"];
  sendCommand: ReturnType<typeof useSimClient>["sendCommand"];
}) {
  const junction = junctionById(alert.junctionId)!;
  const reading = state.readings[alert.junctionId];
  const eta = reading ? reading.eta : 60;
  const queueCount = reading ? reading.vehicleCount : 30;
  const clearTime = reading ? reading.clearTime : 60;

  const totalTimeout = state.alertTimeoutSeconds ?? 30;
  const remainingSeconds = alert.escalatesIn !== undefined ? alert.escalatesIn : totalTimeout;
  const countdownRatio = Math.max(0, Math.min(1, remainingSeconds / totalTimeout));

  // Circular progress: radius 36 -> circumference ~226
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - countdownRatio);

  return (
    <div className="flex flex-col gap-4 bg-critical-soft/20 p-4">
      {/* Escalated Notification (if this officer received an escalated alert) */}
      {alert.escalatedFrom && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 text-amber-500 shrink-0" />
          <span>Escalated from {formatOfficerName(alert.escalatedFrom)}</span>
        </div>
      )}

      {/* Critical Banner */}
      <div className="flex items-center justify-between rounded-lg border border-critical bg-critical px-4 py-2.5 text-white shadow-md">
        <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
          <ShieldAlert className="size-5 shrink-0 animate-pulse" aria-hidden />
          <span>CRITICAL CORRIDOR ALERT</span>
        </div>
        <StatusChip status="CRITICAL" />
      </div>

      {/* Main Alert Card with Countdown Ring */}
      <section className="flex flex-col items-center rounded-xl border-2 border-critical/40 bg-card px-4 py-5 text-center shadow-md">
        {/* State Progression Indicator */}
        <div className="mb-4 flex w-full items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-3">
          <span className={cn(alert.state === AlertState.SENT && "text-critical font-extrabold")}>
            1. Alerted
          </span>
          <span>→</span>
          <span className={cn(alert.state === AlertState.ACKNOWLEDGED && "text-primary font-extrabold")}>
            2. ACK
          </span>
          <span>→</span>
          <span className={cn(alert.state === AlertState.IN_POSITION && "text-primary font-extrabold")}>
            3. In Position
          </span>
          <span>→</span>
          <span className={cn(alert.state === AlertState.CLEARING && "text-clear font-extrabold")}>
            4. Verified
          </span>
        </div>

        {/* Countdown Ring (when in SENT state) */}
        {alert.state === AlertState.SENT ? (
          <div className="relative flex items-center justify-center my-1">
            <svg className="size-24 -rotate-90 transform" viewBox="0 0 96 96">
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-muted"
                strokeWidth="7"
                fill="none"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                className="stroke-critical transition-all duration-300"
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-2xl font-black tnum text-critical">{remainingSeconds}</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">s to ACK</span>
            </div>
          </div>
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
            <CheckCircle2 className="size-7" aria-hidden />
          </span>
        )}

        <h1 className="mt-2 text-display font-bold">{junction.name}</h1>
        <p className="mt-0.5 text-xs font-semibold text-critical">
          Clear corridor lane immediately for approaching ambulance
        </p>

        {/* Vital Stats */}
        <div className="mt-4 grid w-full grid-cols-3 gap-2 text-left">
          <div className="rounded-md bg-muted p-2 text-center">
            <dt className="text-[11px] text-muted-foreground">Ambulance ETA</dt>
            <dd className="tnum mt-0.5 text-title font-bold text-critical">
              {formatDuration(eta)}
            </dd>
          </div>
          <div className="rounded-md bg-muted p-2 text-center">
            <dt className="text-[11px] text-muted-foreground">Approach queue</dt>
            <dd className="tnum mt-0.5 text-title font-bold">{queueCount} veh</dd>
          </div>
          <div className="rounded-md bg-muted p-2 text-center">
            <dt className="text-[11px] text-muted-foreground">Est. clear time</dt>
            <dd className="tnum mt-0.5 text-title font-bold">{formatDuration(clearTime)}</dd>
          </div>
        </div>

        {alert.state === AlertState.ACKNOWLEDGED && (
          <div className="mt-3 w-full rounded bg-emerald-500/10 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ Acknowledged. Proceed to position at intersection.
          </div>
        )}
      </section>

      {/* Action Buttons based on Alert State */}
      <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Officer Action Required
        </p>

        {alert.state === AlertState.SENT && (
          <Button
            size="touch-xl"
            className="w-full bg-critical hover:bg-critical/90 text-white font-bold text-base shadow"
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
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-base shadow"
            onClick={() => {
              sendCommand({
                type: "IN_POSITION",
                alertId: alert.id,
                officerId: officer.id,
              });
            }}
          >
            <ShieldCheck className="mr-2 size-5" />
            2. Mark In Position (Start 3x Drain)
          </Button>
        )}

        {(alert.state === AlertState.IN_POSITION || alert.state === AlertState.CLEARING) && (
          <div className="flex flex-col gap-2">
            <Button
              size="touch-xl"
              className="w-full bg-clear hover:bg-clear/90 text-white font-bold text-base shadow"
              onClick={() => {
                sendCommand({
                  type: "ROAD_CLEARED",
                  alertId: alert.id,
                  officerId: officer.id,
                });
              }}
            >
              <CheckCircle2 className="mr-2 size-5" />
              3. Road Cleared (Start Verification)
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
                  reason: "Heavy traffic obstruction / VIP movement",
                });
              }}
            >
              <XCircle className="mr-2 size-4" />
              Can't Clear (Request Escalation)
            </Button>
          </div>
        )}
      </section>

      {/* Map Context */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <MapFrame
          className="h-40"
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

// ─── Idle Screen: Standing By (Never looks dead) ────────────────────────────

function NowTab({
  officer,
  state,
  connectionState,
  isStale,
  escalatedAlert,
}: {
  officer: ReturnType<typeof officerById> extends infer O ? NonNullable<O> : never;
  state: ReturnType<typeof useSimClient>["state"];
  connectionState: ReturnType<typeof useSimClient>["connectionState"];
  isStale?: boolean | undefined;
  escalatedAlert?: AlertRecord | undefined;
}) {
  const junction = junctionById(officer.junctionId)!;
  const reading = state.readings[junction.id];
  const eta = reading ? reading.eta : 0;
  const status = reading ? reading.status : "CLEAR";
  const queueCount = reading ? reading.vehicleCount : 0;
  const clearTime = reading ? reading.clearTime : 0;
  const distMeters = reading ? reading.distanceMeters - state.ambulance.distanceMeters : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Escalation notification if this officer timed out */}
      {escalatedAlert && (
        <div className="flex items-center gap-2 rounded-lg border-2 border-amber-500 bg-amber-500/15 p-3 text-xs font-semibold text-amber-950 dark:text-amber-200 shadow-sm">
          <AlertTriangle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">No response recorded</p>
            <p className="text-[11px] font-normal">
              Alert for {junctionById(escalatedAlert.junctionId)?.name ?? "junction"} escalated to{" "}
              <strong>{formatOfficerName(escalatedAlert.officerId)}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Idle Card */}
      <section className="flex flex-col items-center rounded-xl border bg-card px-5 py-6 text-center shadow-sm">
        {/* Pulsing Connected Dot */}
        <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Standing by · Connected to Control Room</span>
        </div>

        <h1 className="mt-4 text-display font-bold">All Clear</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          No emergency alert at {junction.name}. Approach lane normal.
        </p>

        {/* Live Ambulance Corridor Info */}
        <div className="mt-6 w-full rounded-lg bg-muted/60 p-3 text-left">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Ambulance on corridor</span>
            <span className="font-mono font-bold text-foreground">{AMBULANCE.plate}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded bg-card p-2 border">
              <dt className="text-[10px] text-muted-foreground uppercase font-bold">ETA to your post</dt>
              <dd className="tnum mt-0.5 text-title font-bold text-foreground">
                {status === "PASSED" ? "PASSED" : formatDuration(eta)}
              </dd>
            </div>
            <div className="rounded bg-card p-2 border">
              <dt className="text-[10px] text-muted-foreground uppercase font-bold">Distance away</dt>
              <dd className="tnum mt-0.5 text-title font-bold text-foreground">
                {status === "PASSED" ? "PASSED" : `${(Math.max(0, distMeters) / 1000).toFixed(1)} km`}
              </dd>
            </div>
          </div>
        </div>

        {/* Junction Traffic State */}
        <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground text-[11px]">Current Queue</p>
            <p className="tnum font-bold text-sm mt-0.5">{queueCount} vehicles</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-muted-foreground text-[11px]">Clearance Time</p>
            <p className="tnum font-bold text-sm mt-0.5">{formatDuration(clearTime)}</p>
          </div>
        </div>
      </section>

      {/* Map Frame */}
      <section className="overflow-hidden rounded-xl border bg-card">
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
        <div className="flex items-center justify-between px-3 py-2 text-xs border-t bg-muted/30">
          <span className="text-muted-foreground font-medium">{junction.name} Approach</span>
          <StatusChip status={status} size="sm" />
        </div>
      </section>

      <p className="px-2 text-center text-[11px] text-muted-foreground">
        Full-screen alert takeover with siren and vibration fires automatically if your junction turns critical.
      </p>
    </div>
  );
}

// ─── History Tab ────────────────────────────────────────────────────────────

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
