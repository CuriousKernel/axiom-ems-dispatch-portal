import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Camera,
  ChevronDown,
  LayoutDashboard,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { AppFooter } from "@/components/axiom/AppFooter";
import { BrandMark } from "@/components/axiom/BrandMark";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSimulator } from "@/lib/simulator-engine";
import { useTripRecorder } from "@/lib/use-trip-recorder";
import { formatDuration } from "@/lib/axiom/format";
import { calculateMinutesSaved } from "@/lib/analytics-store";
import { HOSPITAL_ID, JUNCTIONS } from "@/lib/axiom/seed";
import { isActiveAlert } from "@/lib/alerts";
import type { SimSpeed } from "@/lib/sim-transport";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/control")({
  head: () => ({
    meta: [
      { title: "Control Room | Axiom-EMS" },
      { name: "description", content: "Control room dashboard: live ambulance corridor map, junction status, officer alerts and minutes saved." },
      { property: "og:title", content: "Control Room | Axiom-EMS" },
      { property: "og:description", content: "Live ambulance corridor map, junction status, officer alerts and minutes saved." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlLayout,
});

const NAV = [
  { to: "/control", label: "Live", icon: LayoutDashboard, exact: true },
  { to: "/control/vision", label: "Vision", icon: Camera, exact: false },
  { to: "/control/analytics", label: "Report", icon: BarChart3, exact: false },
] as const;

function ControlLayout() {
  useTripRecorder();
  const startEngine = useSimulator((s) => s.startEngine);
  const stopEngine = useSimulator((s) => s.stopEngine);
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setIsEmbedded(p.get("embed") === "1");
    }
  }, []);

  // Engine lifecycle: started once for the entire Control Room layout.
  // Stays running across Live and Report tabs.
  useEffect(() => {
    startEngine();
    return () => stopEngine();
  }, [startEngine, stopEngine]);

  return (
    <div className={cn(
      "grid min-h-screen w-full min-w-0 bg-background text-foreground",
      isEmbedded ? "grid-cols-[60px_1fr]" : "grid-cols-[200px_1fr]"
    )}>
      <aside className={cn(
        "sticky top-0 flex h-screen flex-col border-r bg-sidebar py-4",
        isEmbedded ? "px-1.5 items-center" : "px-3"
      )}>
        <div className={cn("pb-4", isEmbedded ? "px-0 text-center" : "px-2 pb-6")}>
          <BrandMark compact={isEmbedded} />
          {!isEmbedded && <p className="mt-1 pl-9 text-xs text-muted-foreground">Control Room</p>}
        </div>
        <nav className="flex flex-col gap-1 w-full" aria-label="Control room sections">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              title={n.label}
              className={cn(
                "flex h-10 items-center rounded-md text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent",
                isEmbedded ? "justify-center px-0 w-full" : "gap-3 px-3"
              )}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent" }}
            >
              <n.icon className="size-4 shrink-0" aria-hidden />
              {!isEmbedded && <span>{n.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto w-full">
          <Link
            to="/"
            title="Switch role"
            className={cn(
              "flex h-10 items-center rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
              isEmbedded ? "justify-center px-0 w-full" : "gap-3 px-3"
            )}
          >
            <ArrowLeft className="size-4 shrink-0" />
            {!isEmbedded && <span>Switch role</span>}
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar isEmbedded={isEmbedded} />
        <div className={cn("flex flex-1 flex-col gap-4", isEmbedded ? "p-2.5" : "p-4")}>
          <Outlet />
        </div>
        {!isEmbedded && <AppFooter className="border-t" />}
      </div>
    </div>
  );
}

function TopBar({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const speed = useSimulator((s) => s.speed);
  const setSpeed = useSimulator((s) => s.setSpeed);
  const paused = useSimulator((s) => s.paused);
  const startTrip = useSimulator((s) => s.startTrip);
  const pauseTrip = useSimulator((s) => s.pauseTrip);
  const resumeTrip = useSimulator((s) => s.resumeTrip);
  const restartTrip = useSimulator((s) => s.restartTrip);
  const setDensity = useSimulator((s) => s.setDensity);
  const ambStatus = useSimulator((s) => s.ambulance.status);
  const readings = useSimulator((s) => s.readings);
  const alerts = useSimulator((s) => s.alerts);
  const distanceMeters = useSimulator((s) => s.ambulance.distanceMeters);

  // Compute 3 key inline indicators
  const hospitalReading = readings[HOSPITAL_ID];
  const etaSec = hospitalReading?.eta ?? 0;
  const activeAlertsCount = alerts.filter(isActiveAlert).length;
  const clearedCount = Object.values(readings).filter((r) => r.status === "PASSED" || r.status === "CLEAR").length;
  const minutesSaved = calculateMinutesSaved(clearedCount, alerts.length, distanceMeters / 15);

  // Compute status badge & primary button state
  let statusBadgeLabel = "IDLE";
  let statusBadgeClass = "bg-muted text-muted-foreground border-border";

  if (ambStatus === "arrived") {
    statusBadgeLabel = "ARRIVED";
    statusBadgeClass = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
  } else if (ambStatus === "running") {
    if (paused) {
      statusBadgeLabel = "PAUSED";
      statusBadgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    } else {
      statusBadgeLabel = "RUNNING";
      statusBadgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    }
  }

  // Primary button config
  let primaryLabel = "Start trip";
  let primaryIcon = Play;
  let primaryAction = startTrip;

  if (ambStatus === "idle") {
    primaryLabel = "Start trip";
    primaryIcon = Play;
    primaryAction = startTrip;
  } else if (ambStatus === "running") {
    if (paused) {
      primaryLabel = "Resume";
      primaryIcon = Play;
      primaryAction = resumeTrip;
    } else {
      primaryLabel = "Pause";
      primaryIcon = Pause;
      primaryAction = pauseTrip;
    }
  } else if (ambStatus === "arrived") {
    primaryLabel = "Restart";
    primaryIcon = RotateCcw;
    primaryAction = restartTrip;
  }

  const PrimaryIcon = primaryIcon;

  return (
    <header className={cn(
      "sticky top-0 z-20 flex items-center justify-between border-b bg-card/95 backdrop-blur",
      isEmbedded ? "h-13 px-3 gap-2 flex-wrap" : "h-16 px-4"
    )}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <ConnectionChip />

        {/* Primary state-aware simulation button */}
        <div className="flex items-center gap-1.5 border-l pl-2.5">
          <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wider", statusBadgeClass)}>
            {statusBadgeLabel}
          </span>

          <Button
            size="sm"
            variant={primaryLabel === "Pause" ? "outline" : "default"}
            onClick={primaryAction}
            className="h-8 gap-1.5 text-xs font-semibold px-2.5"
          >
            <PrimaryIcon className="size-3.5" aria-hidden />
            {primaryLabel}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Restart simulation"
                onClick={restartTrip}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restart simulation</TooltipContent>
          </Tooltip>
        </div>

        {/* Speed Controls: 1x, 2x, 4x, 8x */}
        <div className="flex items-center gap-1.5 border-l pl-2.5">
          <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">Speed</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={String(speed)}
            onValueChange={(v) => v && setSpeed(Number(v) as SimSpeed)}
          >
            {([1, 2, 4, 8] as const).map((s) => (
              <ToggleGroupItem
                key={s}
                value={String(s)}
                className="tnum px-1.5 h-7 data-[state=on]:bg-primary-soft data-[state=on]:text-primary text-[11px]"
              >
                {s}x
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Demo tools dropdown */}
        <div className="border-l pl-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-medium px-2">
                <Wrench className="size-3.5 text-muted-foreground" />
                <span className={cn(isEmbedded && "hidden md:inline")}>Demo tools</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs">Inject Congestion</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setDensity("mandi", 85);
                  toast.success("Mandi House jammed (85% density)");
                }}
              >
                Jam Mandi House
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDensity("ito", 85);
                  toast.success("ITO jammed (85% density)");
                }}
              >
                Jam ITO
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  for (const j of JUNCTIONS) {
                    setDensity(j.id, 0);
                  }
                  toast.success("All jams cleared");
                }}
              >
                Clear all jams
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 3 inline numbers: ETA to hospital, active alerts, minutes saved */}
      <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">ETA:</span>
          <span className="tnum font-bold text-xs sm:text-sm text-foreground">
            {ambStatus === "arrived" ? "ARRIVED" : formatDuration(etaSec)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs border-l pl-3">
          <span className="text-muted-foreground">Alerts:</span>
          <span className={cn("tnum font-bold text-xs sm:text-sm", activeAlertsCount > 0 ? "text-critical" : "text-foreground")}>
            {activeAlertsCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs border-l pl-3">
          <span className="text-muted-foreground">Saved:</span>
          <span className="tnum font-bold text-xs sm:text-sm text-clear">
            {minutesSaved > 0 ? `+${minutesSaved.toFixed(1)}m` : "0m"}
          </span>
        </div>
        {!isEmbedded && (
          <Link to="/demo">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Sparkles className="size-3 text-primary" />
              3-in-1 Demo
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
