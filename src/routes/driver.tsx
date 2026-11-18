import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Gauge,
  MapPin,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { MapFrame } from "@/components/axiom/MapFrame";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/axiom/format";
import { AMBULANCE, HOSPITAL_ID, JUNCTIONS, ORIGIN, junctionById } from "@/lib/axiom/seed";
import { useSimClient } from "@/lib/use-sim-client";
import { PRIMARY_ROUTE, ALT_ROUTE } from "@/lib/route-data";
import { speakRerouteAnnouncement } from "@/lib/reroute";
import { calculateMinutesSaved } from "@/lib/analytics-store";
import type { JunctionStatus, LatLng, Priority } from "@/lib/axiom/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "Ambulance Driver | Axiom-EMS" },
      { name: "description", content: "Glanceable ambulance driver HUD: ETA to hospital, next junction status and corridor controls." },
      { property: "og:title", content: "Ambulance Driver | Axiom-EMS" },
      { property: "og:description", content: "ETA to hospital, next junction status and corridor controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DriverView,
});

export function DriverView() {
  const { state, connectionState, sendCommand, isStale } = useSimClient();
  const hospital = junctionById(HOSPITAL_ID)!;

  const [isEmbedded, setIsEmbedded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isDraggedAway, setIsDraggedAway] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const prevRerouted = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setIsEmbedded(p.get("embed") === "1");
    }
  }, []);

  // Voice announcement on reroute
  useEffect(() => {
    if (state.rerouted && !prevRerouted.current) {
      prevRerouted.current = true;
      speakRerouteAnnouncement(
        state.rerouteMessage ?? "Route changed. Diverting via Ring Road to avoid ITO.",
        muted,
      );
    }
  }, [state.rerouted, state.rerouteMessage, muted]);

  const amb = state.ambulance;
  const isLive = (connectionState === "live" || connectionState === "local") && !isStale;

  // Active route points
  const activeRoute = state.activeRouteId === "alt" ? ALT_ROUTE : PRIMARY_ROUTE;
  const hospitalReading = state.readings[HOSPITAL_ID];
  const hospitalEta = hospitalReading ? hospitalReading.eta : 0;
  const hospitalDist = Math.max(0, activeRoute.totalLengthMeters - amb.distanceMeters);

  // Compute traveled and ahead paths
  const { traveled, ahead } = useMemo(() => {
    const currentDist = amb.distanceMeters;
    const trav: LatLng[] = [];
    const ah: LatLng[] = [];

    for (const pt of activeRoute.points) {
      if (pt.cumulativeDistanceMeters <= currentDist) {
        trav.push({ lat: pt.lat, lng: pt.lng });
      } else {
        ah.push({ lat: pt.lat, lng: pt.lng });
      }
    }

    if (trav.length > 0 && ah.length > 0) {
      trav.push({ lat: amb.lat, lng: amb.lng });
      ah.unshift({ lat: amb.lat, lng: amb.lng });
    }

    return { traveled: trav, ahead: ah };
  }, [activeRoute, amb.distanceMeters, amb.lat, amb.lng]);

  const liveJunctions = useMemo(() => {
    return JUNCTIONS.map((j) => ({
      ...j,
      status: (state.readings[j.id]?.status ?? "CLEAR") as JunctionStatus,
    }));
  }, [state.readings]);

  // Find upcoming junction
  const upcomingJunctions = useMemo(() => {
    return JUNCTIONS.slice(1, -1).filter((j) => {
      const r = state.readings[j.id];
      return r?.status !== "PASSED";
    });
  }, [state.readings]);

  const nextJunction = upcomingJunctions[0] ?? hospital;
  const nextReading = state.readings[nextJunction.id];
  const nextEta = nextReading ? nextReading.eta : 0;
  const nextDist = nextReading ? Math.max(0, Math.round(nextReading.distanceMeters - amb.distanceMeters)) : 0;
  const nextAlert = state.alerts.find((a) => a.junctionId === nextJunction.id);

  // Status message for top card
  let nextStatusText = `${nextJunction.name}: road clear, go`;
  let nextStatusTone: "clear" | "watch" | "critical" = "clear";

  if (state.rerouted && nextJunction.id === "ito") {
    nextStatusText = "Road blocked ahead. Diverting via Ring Road";
    nextStatusTone = "critical";
  } else if (nextAlert) {
    if (nextAlert.state === "IN_POSITION" || nextAlert.state === "CLEARING") {
      nextStatusText = `${nextJunction.name}: officer clearing the road`;
      nextStatusTone = "watch";
    } else if (nextAlert.state === "ACKNOWLEDGED") {
      nextStatusText = `${nextJunction.name}: officer in position`;
      nextStatusTone = "watch";
    } else if (nextAlert.state === "VERIFIED_CLEAR") {
      nextStatusText = `${nextJunction.name}: road clear, go`;
      nextStatusTone = "clear";
    } else if (nextAlert.state === "NOT_CLEARED") {
      nextStatusText = `${nextJunction.name}: no reply, rerouting`;
      nextStatusTone = "critical";
    } else {
      nextStatusText = `${nextJunction.name}: clearing requested`;
      nextStatusTone = "critical";
    }
  }

  // Estimated arrival clock time
  const arrivalClockStr = useMemo(() => {
    const arrivalDate = new Date(Date.now() + hospitalEta * 1000);
    return arrivalDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }, [hospitalEta]);

  // Command handlers with user feedback
  const handleStartTrip = () => {
    sendCommand({ type: "START_TRIP" });
    try {
      toast.success("Ambulance dispatched! Emergency corridor active.");
    } catch {
      // ignore
    }
  };

  const handlePause = () => {
    sendCommand({ type: "PAUSE_TRIP" });
    try {
      toast("Trip paused");
    } catch {
      // ignore
    }
  };

  const handleResume = () => {
    sendCommand({ type: "RESUME_TRIP" });
    try {
      toast.success("Trip resumed");
    } catch {
      // ignore
    }
  };

  const handleEndTrip = () => {
    sendCommand({ type: "END_TRIP" });
    try {
      toast("Trip ended");
    } catch {
      // ignore
    }
  };

  const handleRestart = () => {
    sendCommand({ type: "RESTART_TRIP" });
    try {
      toast.success("Simulation restarted from Connaught Place");
    } catch {
      // ignore
    }
  };

  const handleSetPriority = (p: Priority) => {
    sendCommand({ type: "SET_PRIORITY", priority: p });
    try {
      toast(`Priority changed to ${p}`);
    } catch {
      // ignore
    }
  };

  const handleRecenter = () => {
    setRecenterTrigger((n) => n + 1);
    setIsDraggedAway(false);
    try {
      toast("Map re-centered on ambulance");
    } catch {
      // ignore
    }
  };

  const minutesSaved = useMemo(() => {
    const cleared = state.alerts.filter((a) => a.state === "VERIFIED_CLEAR").length;
    return calculateMinutesSaved(cleared, state.alerts.length, state.simTimeSeconds);
  }, [state.alerts, state.simTimeSeconds]);

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-background select-none font-sans">
      {/* ── Top Header (Hidden in embed mode) ──────────────────────────────── */}
      {!isEmbedded && (
        <header className="z-30 flex items-center gap-3 border-b bg-card/95 px-4 py-2.5 backdrop-blur shadow-sm">
          <Link
            to="/"
            aria-label="Change role"
            className="-ml-2 flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-foreground">{AMBULANCE.plate}</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary uppercase">
                {state.driverPriority}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">To {hospital.name}</p>
          </div>
          <ConnectionChip state={connectionState} stale={isStale} />
        </header>
      )}

      {/* ── Full-Screen Driver Map ─────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <MapFrame
          className="h-full w-full"
          variant="driver"
          showLabels={false}
          junctions={liveJunctions}
          traveled={traveled}
          ahead={ahead}
          ambulance={{
            lat: amb.lat,
            lng: amb.lng,
            heading: amb.heading,
          }}
          onUserDragAway={() => setIsDraggedAway(true)}
          recenterTrigger={recenterTrigger}
        />
      </div>

      {/* ── Connection Alert Banner (When Stale or Disconnected) ───────────── */}
      {(!isLive || isStale) && (
        <div className="z-30 mx-3 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/90 p-2.5 text-center text-xs font-semibold text-amber-950 shadow-lg backdrop-blur">
          Control Room not sending. Keep the Control Room window visible, or open /demo.
        </div>
      )}

      {/* ── Top Floating Card: Next Junction HUD ───────────────────────────── */}
      <div className={cn("z-20 mx-3 mt-3 flex flex-col gap-2 transition-all", isEmbedded && "mt-2")}>
        {/* Reroute Alert Banner */}
        {state.rerouted && (
          <div className="flex items-center gap-2.5 rounded-xl border-2 border-amber-500 bg-amber-500/95 p-3 text-amber-950 shadow-xl backdrop-blur">
            <AlertTriangle className="size-5 shrink-0 text-amber-950" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold tracking-wide uppercase">Reroute Active (+1:10)</p>
              <p className="truncate text-xs font-semibold">{state.rerouteMessage ?? "Diverting via Ring Road to avoid ITO"}</p>
            </div>
            <button
              onClick={() => setMuted((m) => !m)}
              className="rounded p-1 text-amber-950 hover:bg-amber-600/30"
              aria-label={muted ? "Unmute reroute audio" : "Mute reroute audio"}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>
        )}

        {/* Next Turn / Junction HUD */}
        <div className="flex items-center justify-between rounded-xl border bg-card/95 p-3.5 shadow-lg backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
              <Navigation className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Next Waypoint</p>
              <p className="text-base font-bold text-foreground leading-tight">{nextJunction.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{nextDist} m ahead</p>
            </div>
          </div>

          <div className="text-right">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                nextStatusTone === "clear"
                  ? "bg-clear-soft text-clear"
                  : nextStatusTone === "watch"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-critical-soft text-critical",
              )}
            >
              {nextStatusTone === "clear" && <CheckCircle2 className="size-3" />}
              {nextStatusTone === "watch" && <ShieldCheck className="size-3" />}
              {nextStatusTone === "critical" && <ShieldAlert className="size-3" />}
              {nextStatusText}
            </span>
            <p className="mt-1 text-xs font-bold text-foreground tnum">{formatDuration(nextEta)}</p>
          </div>
        </div>
      </div>

      {/* ── Floating Recenter Button (Shown when user panned away) ─────────── */}
      {isDraggedAway && (
        <div className="z-20 absolute right-4 bottom-72">
          <Button
            size="sm"
            onClick={handleRecenter}
            className="rounded-full bg-card/95 text-foreground hover:bg-card border shadow-xl font-semibold backdrop-blur"
          >
            <Navigation className="mr-1.5 size-4 text-primary fill-primary" />
            Recenter
          </Button>
        </div>
      )}

      {/* ── Bottom Sheet Controls & Metrics ─────────────────────────────────── */}
      <div className={cn("z-20 mt-auto p-3 flex flex-col gap-2.5", !isEmbedded && "pb-16")}>
        <div className="rounded-2xl border bg-card/95 p-4 shadow-2xl backdrop-blur flex flex-col gap-3.5">
          {/* Main Hospital ETA & Trip Metrics */}
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                ETA to AIIMS Hospital
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-foreground tnum">
                  {amb.status === "arrived" ? "ARRIVED" : formatDuration(hospitalEta)}
                </span>
                {amb.status !== "arrived" && (
                  <span className="text-xs font-medium text-muted-foreground">({arrivalClockStr})</span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 text-right text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground tnum">
                <Gauge className="size-3.5 text-muted-foreground" />
                {Math.round(amb.speedKmh)} km/h
              </span>
              <span className="text-muted-foreground tnum">
                {(hospitalDist / 1000).toFixed(1)} km left
              </span>
            </div>
          </div>

          {/* Priority Selection Strip */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Priority:</span>
            <div className="grid grid-cols-3 gap-1.5 flex-1">
              {(
                [
                  { id: "P1", label: "Critical", tone: "bg-critical text-white border-critical" },
                  { id: "P2", label: "Serious", tone: "bg-amber-600 text-white border-amber-600" },
                  { id: "P3", label: "Stable", tone: "bg-primary text-white border-primary" },
                ] as const
              ).map((p) => {
                const isActive = state.driverPriority === p.id;
                return (
                  <button
                    key={p.id}
                    disabled={!isLive}
                    onClick={() => handleSetPriority(p.id)}
                    className={cn(
                      "h-8 rounded-lg border text-xs font-bold transition-all",
                      isActive
                        ? p.tone
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                      !isLive && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {p.id} {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── State-Aware Action Buttons (Min 56px height) ───────────────── */}
          {amb.status === "idle" && (
            <div className="space-y-1.5">
              <Button
                size="touch-xl"
                disabled={!isLive}
                onClick={handleStartTrip}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-lg"
              >
                <Play className="mr-2 size-5 fill-current" />
                Start trip (Connaught Place)
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Ambulance waiting for dispatch clearance.
              </p>
            </div>
          )}

          {(amb.status === "running" || amb.status === "paused") && (
            <div className="grid grid-cols-2 gap-2.5">
              {state.paused ? (
                <Button
                  size="touch-xl"
                  disabled={!isLive}
                  onClick={handleResume}
                  className="h-14 bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-md"
                >
                  <Play className="mr-2 size-5 fill-current" />
                  Resume
                </Button>
              ) : (
                <Button
                  size="touch-xl"
                  variant="outline"
                  disabled={!isLive}
                  onClick={handlePause}
                  className="h-14 border-2 font-bold text-base hover:bg-accent"
                >
                  <Pause className="mr-2 size-5" />
                  Pause
                </Button>
              )}

              <Button
                size="touch-xl"
                variant="destructive"
                disabled={!isLive}
                onClick={handleEndTrip}
                className="h-14 font-bold text-base shadow-md"
              >
                <Square className="mr-2 size-5" />
                End trip
              </Button>
            </div>
          )}

          {amb.status === "arrived" && (
            <div className="space-y-2.5">
              <div className="rounded-xl border border-clear/40 bg-clear/10 p-3 text-center">
                <p className="text-xs font-bold text-clear uppercase">Patient Delivered at AIIMS</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trip finished in {formatDuration(state.simTimeSeconds)}. Estimated{" "}
                  <strong className="text-clear">+{minutesSaved} min</strong> saved.
                </p>
              </div>

              <Button
                size="touch-xl"
                disabled={!isLive}
                onClick={handleRestart}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold text-base shadow-lg"
              >
                <RotateCcw className="mr-2 size-5" />
                Restart trip
              </Button>
            </div>
          )}
        </div>
      </div>

      {!isEmbedded && <AppFooter />}
    </div>
  );
}
