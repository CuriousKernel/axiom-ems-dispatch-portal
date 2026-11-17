import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, Gauge, Navigation, Play, Square, Volume2 } from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { MapFrame } from "@/components/axiom/MapFrame";
import { Chip } from "@/components/axiom/StatusChip";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { driverChipFor } from "@/lib/axiom/driver";
import { formatDuration } from "@/lib/axiom/format";
import { AMBULANCE, HOSPITAL_ID, JUNCTIONS, ORIGIN, junctionById } from "@/lib/axiom/seed";
import { useSimClient } from "@/lib/use-sim-client";
import { PRIMARY_ROUTE } from "@/lib/route-data";
import type { JunctionStatus, LatLng, Priority } from "@/lib/axiom/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "Ambulance Driver | Axiom-EMS" },
      { name: "description", content: "Glanceable ambulance driver screen: ETA to hospital, next junction status and reroutes." },
      { property: "og:title", content: "Ambulance Driver | Axiom-EMS" },
      { property: "og:description", content: "ETA to hospital, next junction status and reroutes at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DriverView,
});

function DriverView() {
  const { state, connectionState, sendCommand } = useSimClient();
  const hospital = junctionById(HOSPITAL_ID)!;
  const isTripActive = state.ambulance.status === "running" || state.ambulance.status === "paused";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <Link
          to="/"
          aria-label="Change role"
          className="-ml-2 flex size-12 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{AMBULANCE.plate}</p>
          <p className="truncate text-sm text-muted-foreground">To {hospital.name}</p>
        </div>
        <ConnectionChip state={connectionState} />
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {isTripActive ? (
          <ActiveTrip state={state} sendCommand={sendCommand} />
        ) : (
          <TripSetup state={state} sendCommand={sendCommand} />
        )}
      </main>

      <AppFooter />
    </div>
  );
}

function TripSetup({
  state,
  sendCommand,
}: {
  state: ReturnType<typeof useSimClient>["state"];
  sendCommand: ReturnType<typeof useSimClient>["sendCommand"];
}) {
  const origin = ORIGIN;
  const hospital = junctionById(HOSPITAL_ID)!;

  const liveJunctions = useMemo(() => {
    return JUNCTIONS.map((j) => ({
      ...j,
      status: (state.readings[j.id]?.status ?? "CLEAR") as JunctionStatus,
    }));
  }, [state.readings]);

  return (
    <>
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Route</p>
        <p className="mt-1 text-title font-semibold">
          {origin.name} to {hospital.name}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{JUNCTIONS.length - 2} junctions on the way</p>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <MapFrame
          className="h-64"
          showLabels={false}
          junctions={liveJunctions}
          ahead={PRIMARY_ROUTE.points}
          ambulance={{
            lat: state.ambulance.lat,
            lng: state.ambulance.lng,
            heading: state.ambulance.heading,
          }}
        />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Priority</p>
        <ToggleGroup
          type="single"
          value={state.driverPriority}
          onValueChange={(v) => v && sendCommand({ type: "SET_PRIORITY", priority: v as Priority })}
          className="mt-3 grid grid-cols-2 gap-2"
        >
          {(["P1", "P2"] as const).map((p) => (
            <ToggleGroupItem
              key={p}
              value={p}
              className="h-12 rounded-lg border text-base data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary"
            >
              {p} {p === "P1" ? "Critical" : "Urgent"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <div className="mt-auto pt-2">
        <Button size="touch-xl" onClick={() => sendCommand({ type: "START_TRIP" })}>
          <Play aria-hidden className="mr-2 size-5" />
          Start trip
        </Button>
      </div>
    </>
  );
}

function ActiveTrip({
  state,
  sendCommand,
}: {
  state: ReturnType<typeof useSimClient>["state"];
  sendCommand: ReturnType<typeof useSimClient>["sendCommand"];
}) {
  const hospitalReading = state.readings[HOSPITAL_ID];
  const hospitalEta = hospitalReading ? hospitalReading.eta : 0;

  // Find upcoming junctions that haven't been passed yet (excluding hospital)
  const upcomingJunctions = useMemo(() => {
    return JUNCTIONS.slice(1, -1).filter((j) => {
      const r = state.readings[j.id];
      return r?.status !== "PASSED";
    });
  }, [state.readings]);

  const nextJunction = upcomingJunctions[0] ?? junctionById(HOSPITAL_ID)!;
  const nextAlert = state.alerts.find((a) => a.junctionId === nextJunction.id);
  const nextChip = driverChipFor(nextAlert ? { ...nextAlert, escalatesIn: null } : undefined);
  const nextEta = state.readings[nextJunction.id]?.eta ?? 0;

  // Polylines
  const { traveled, ahead } = useMemo(() => {
    const currentDist = state.ambulance.distanceMeters;
    const trav: LatLng[] = [];
    const ah: LatLng[] = [];

    for (const pt of PRIMARY_ROUTE.points) {
      if (pt.cumulativeDistanceMeters <= currentDist) {
        trav.push({ lat: pt.lat, lng: pt.lng });
      } else {
        ah.push({ lat: pt.lat, lng: pt.lng });
      }
    }

    if (trav.length > 0 && ah.length > 0) {
      trav.push({ lat: state.ambulance.lat, lng: state.ambulance.lng });
      ah.unshift({ lat: state.ambulance.lat, lng: state.ambulance.lng });
    }

    return { traveled: trav, ahead: ah };
  }, [state.ambulance.distanceMeters, state.ambulance.lat, state.ambulance.lng]);

  const liveJunctions = useMemo(() => {
    return JUNCTIONS.map((j) => ({
      ...j,
      status: (state.readings[j.id]?.status ?? "CLEAR") as JunctionStatus,
    }));
  }, [state.readings]);

  return (
    <>
      <section className="rounded-lg border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">ETA to hospital</p>
        <p className="tnum mt-1 text-hero font-semibold tracking-tight">
          {state.ambulance.status === "arrived" ? "ARRIVED" : formatDuration(hospitalEta)}
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 text-base text-muted-foreground">
          <span className="tnum inline-flex items-center gap-1.5 font-semibold text-foreground">
            <Gauge className="size-5 text-muted-foreground" aria-hidden />
            {Math.round(state.ambulance.speedKmh)} km/h
          </span>
          <Chip tone="neutral">{state.driverPriority}</Chip>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Next junction</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-display font-semibold">{nextJunction.name}</p>
          <span className="tnum text-title font-semibold">{formatDuration(nextEta)}</span>
        </div>
        <Chip tone={nextChip.tone} icon={nextChip.icon} size="lg" className="mt-3">
          {nextChip.label}
        </Chip>
      </section>

      <section className="flex items-center gap-3 rounded-lg border bg-primary-soft p-4 text-primary">
        <Navigation className="size-6 shrink-0" aria-hidden />
        <p className="flex-1 text-title font-semibold">Priority Corridor Active</p>
        <Volume2 className="size-5 shrink-0 opacity-60" aria-label="Voice guidance (later phase)" />
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <MapFrame
          className="h-56"
          showLabels={false}
          junctions={liveJunctions}
          traveled={traveled}
          ahead={ahead}
          ambulance={{
            lat: state.ambulance.lat,
            lng: state.ambulance.lng,
            heading: state.ambulance.heading,
          }}
        />
      </section>

      {upcomingJunctions.slice(1).length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {upcomingJunctions.slice(1).map((j) => {
            const alert = state.alerts.find((a) => a.junctionId === j.id);
            const chip = driverChipFor(alert ? { ...alert, escalatesIn: null } : undefined);
            const reading = state.readings[j.id];
            const eta = reading ? reading.eta : 0;
            return (
              <li key={j.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-1 text-base font-medium">{j.name}</span>
                <span className="tnum text-sm text-muted-foreground">{formatDuration(eta)}</span>
                <Chip tone={chip.tone} icon={chip.icon}>
                  {chip.label}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        variant="outline"
        size="touch"
        className={cn("w-full")}
        onClick={() => sendCommand({ type: "END_TRIP" })}
      >
        <Square aria-hidden className="mr-2 size-4" />
        End trip
      </Button>
    </>
  );
}
