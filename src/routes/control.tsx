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
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Change role
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
  const { source, setSource, speed, setSpeed, paused, togglePaused, controlDark, toggleControlDark } = useAxiom();

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

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Speed</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={String(speed)}
          onValueChange={(v) => v && setSpeed(Number(v) as 1 | 2 | 4)}
        >
          {[1, 2, 4].map((s) => (
            <ToggleGroupItem
              key={s}
              value={String(s)}
              className="tnum px-3 data-[state=on]:bg-primary-soft data-[state=on]:text-primary"
            >
              {s}x
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={togglePaused} aria-label={paused ? "Resume" : "Pause"}>
              {paused ? <Play /> : <Pause />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{paused ? "Resume" : "Pause"} simulation</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Restart" onClick={() => toast("Simulation restarts once the clock is built.")}>
              <RotateCcw />
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
