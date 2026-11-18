import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowLeft,
  BarChart3,
  Camera,
  Cpu,
  LayoutDashboard,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sun,
  Timer,
  TrafficCone,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppFooter } from "@/components/axiom/AppFooter";
import { BrandMark } from "@/components/axiom/BrandMark";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { KpiStrip } from "@/components/axiom/KpiStrip";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAxiom } from "@/lib/axiom/store";
import { useSimulator } from "@/lib/simulator-engine";
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
  { to: "/control/junctions", label: "Junctions", icon: TrafficCone, exact: false },
  { to: "/control/officers", label: "Officers", icon: Users, exact: false },
  { to: "/control/analytics", label: "Analytics", icon: BarChart3, exact: false },
] as const;

function ControlLayout() {
  const dark = useAxiom((s) => s.controlDark);
  const startEngine = useSimulator((s) => s.startEngine);
  const stopEngine = useSimulator((s) => s.stopEngine);

  // Engine lifecycle: started once for the entire Control Room layout.
  // Stays running across Live, Analytics, Officers, and Junctions tabs.
  useEffect(() => {
    startEngine();
    return () => stopEngine();
  }, [startEngine, stopEngine]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);

  return (
    <div className="grid min-h-screen min-w-[1200px] grid-cols-[224px_1fr] bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen flex-col border-r bg-sidebar px-3 py-4">
        <div className="px-2 pb-6">
          <BrandMark />
          <p className="mt-1 pl-9 text-xs text-muted-foreground">Control Room</p>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Control room sections">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent" }}
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Link
            to="/"
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Switch role
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar />
        <div className="flex flex-1 flex-col gap-4 p-4">
          <KpiStrip />
          <Outlet />
        </div>
        <AppFooter className="border-t" />
      </div>
    </div>
  );
}

function TopBar() {
  const { source, setSource, controlDark, toggleControlDark } = useAxiom();
  const speed = useSimulator((s) => s.speed);
  const setSpeed = useSimulator((s) => s.setSpeed);
  const paused = useSimulator((s) => s.paused);
  const startTrip = useSimulator((s) => s.startTrip);
  const pauseTrip = useSimulator((s) => s.pauseTrip);
  const resumeTrip = useSimulator((s) => s.resumeTrip);
  const restartTrip = useSimulator((s) => s.restartTrip);
  const ambStatus = useSimulator((s) => s.ambulance.status);
  const alertTimeout = useSimulator((s) => s.alertTimeoutSeconds);
  const setAlertTimeout = useSimulator((s) => s.setAlertTimeout);

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
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
      <ConnectionChip />

      <div className="ml-2 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Source</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={source}
          onValueChange={(v) => v && setSource(v as "simulator" | "vision")}
        >
          <ToggleGroupItem value="simulator" className="gap-1.5 px-3 data-[state=on]:bg-primary-soft data-[state=on]:text-primary">
            <Cpu className="size-3.5" aria-hidden />
            Simulator
          </ToggleGroupItem>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <ToggleGroupItem value="vision" disabled className="gap-1.5 px-3">
                  <Camera className="size-3.5" aria-hidden />
                  Vision
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent>Vision service connects in Phase 5</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>

      {/* Speed Controls: 1x, 2x, 4x, 8x, 16x */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Speed</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={String(speed)}
          onValueChange={(v) => v && setSpeed(Number(v) as SimSpeed)}
        >
          {([1, 2, 4, 8, 16] as const).map((s) => (
            <ToggleGroupItem
              key={s}
              value={String(s)}
              className="tnum px-2.5 data-[state=on]:bg-primary-soft data-[state=on]:text-primary text-xs"
            >
              {s}x
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Demo Setting: Alert Timeout (30s / 15s) */}
      <div className="flex items-center gap-1.5 border-l pl-3">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground" title="Alert NO_ACK timeout">
          <Timer className="size-3" />
          Timeout
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={String(alertTimeout)}
          onValueChange={(v) => v && setAlertTimeout(Number(v) as 30 | 15)}
        >
          <ToggleGroupItem value="30" className="px-2 text-xs">
            30s
          </ToggleGroupItem>
          <ToggleGroupItem value="15" className="px-2 text-xs">
            15s
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Primary state-aware simulation button + Secondary Restart button */}
      <div className="flex items-center gap-2 border-l pl-3">
        {/* Status badge */}
        <span className={cn("rounded border px-2 py-0.5 text-xs font-bold tracking-wider", statusBadgeClass)}>
          {statusBadgeLabel}
        </span>

        {/* Primary button */}
        <Button
          size="sm"
          variant={primaryLabel === "Pause" ? "outline" : "default"}
          onClick={primaryAction}
          className="gap-1.5 text-xs font-semibold"
        >
          <PrimaryIcon className="size-3.5" aria-hidden />
          {primaryLabel}
        </Button>

        {/* Secondary Restart button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Restart simulation"
              onClick={restartTrip}
            >
              <RotateCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restart simulation</TooltipContent>
        </Tooltip>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={toggleControlDark} aria-label="Toggle dark mode">
              {controlDark ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{controlDark ? "Light" : "Dark"} mode</TooltipContent>
        </Tooltip>
        <Button onClick={() => toast("Demo Mode runs the scripted 3-minute scenario. It arrives in a later phase.")}>
          <Sparkles aria-hidden />
          Demo Mode
        </Button>
      </div>
    </header>
  );
}
