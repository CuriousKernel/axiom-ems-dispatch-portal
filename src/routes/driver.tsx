import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gauge, Navigation, Play, Square, Volume2 } from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { MapFrame } from "@/components/axiom/MapFrame";
import { Chip } from "@/components/axiom/StatusChip";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { corridorWithStatus, ROUTE_PREVIEW } from "@/lib/axiom/corridor";
import { driverChipFor } from "@/lib/axiom/driver";
import { formatDuration } from "@/lib/axiom/format";
import { AMBULANCE, HOSPITAL_ID, JUNCTIONS, ORIGIN, MOCK_ALERTS, junctionById, readingFor } from "@/lib/axiom/seed";
import { useAxiom } from "@/lib/axiom/store";
import type { Priority } from "@/lib/axiom/types";
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
  const active = useAxiom((s) => s.driverTripActive);
  const hospital = junctionById(HOSPITAL_ID)!;

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
        <ConnectionChip />
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">{active ? <ActiveTrip /> : <TripSetup />}</main>

      <AppFooter />
    </div>
  );
}

function TripSetup() {
  const priority = useAxiom((s) => s.driverPriority);
  const setPriority = useAxiom((s) => s.setDriverPriority);
  const start = useAxiom((s) => s.setDriverTripActive);
  const origin = ORIGIN;
  const hospital = junctionById(HOSPITAL_ID)!;

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
        <MapFrame className="h-64" showLabels={false} junctions={corridorWithStatus()} ahead={ROUTE_PREVIEW} ambulance={origin} />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Priority</p>
        <ToggleGroup
          type="single"
          value={priority}
          onValueChange={(v) => v && setPriority(v as Priority)}
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
        <Button size="touch-xl" onClick={() => start(true)}>
          <Play aria-hidden />
          Start trip
        </Button>
      </div>
    </>
  );
}

function ActiveTrip() {
  const end = useAxiom((s) => s.setDriverTripActive);
  const priority = useAxiom((s) => s.driverPriority);
  const hospitalEta = readingFor(HOSPITAL_ID)!.eta;
  const upcoming = JUNCTIONS.slice(1, -1); // skip origin and hospital
  const next = upcoming[0]!;
  const nextChip = driverChipFor(MOCK_ALERTS.find((a) => a.junctionId === next.id));
  const nextEta = readingFor(next.id)!.eta;

  return (
    <>
      <section className="rounded-lg border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">ETA to hospital</p>
        <p className="tnum mt-1 text-hero font-semibold tracking-tight">{formatDuration(hospitalEta)}</p>
        <div className="mt-3 flex items-center justify-center gap-4 text-base text-muted-foreground">
          <span className="tnum inline-flex items-center gap-1.5">
            <Gauge className="size-5" aria-hidden />0 km/h
          </span>
          <Chip tone="neutral">{priority}</Chip>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Next junction</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-display font-semibold">{next.name}</p>
          <span className="tnum text-title font-semibold">{formatDuration(nextEta)}</span>
        </div>
        <Chip tone={nextChip.tone} icon={nextChip.icon} size="lg" className="mt-3">
          {nextChip.label}
        </Chip>
      </section>

      <section className="flex items-center gap-3 rounded-lg border bg-primary-soft p-4 text-primary">
        <Navigation className="size-6 shrink-0" aria-hidden />
        <p className="flex-1 text-title font-semibold">Continue on Barakhamba Road</p>
        <Volume2 className="size-5 shrink-0 opacity-60" aria-label="Voice guidance (later phase)" />
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <MapFrame className="h-56" showLabels={false} junctions={corridorWithStatus()} ahead={ROUTE_PREVIEW} ambulance={ORIGIN} />
      </section>

      <ul className="divide-y rounded-lg border bg-card">
        {upcoming.slice(1).map((j) => {
          const chip = driverChipFor(MOCK_ALERTS.find((a) => a.junctionId === j.id));
          return (
            <li key={j.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1 text-base font-medium">{j.name}</span>
              <span className="tnum text-sm text-muted-foreground">{formatDuration(readingFor(j.id)!.eta)}</span>
              <Chip tone={chip.tone} icon={chip.icon}>
                {chip.label}
              </Chip>
            </li>
          );
        })}
      </ul>

      <Button variant="outline" size="touch" className={cn("w-full")} onClick={() => end(false)}>
        <Square aria-hidden />
        End trip
      </Button>
    </>
  );
}
