/**
 * src/components/axiom/SimulatorPanel.tsx
 *
 * Phase 2 control panel: density sliders per junction + scenario buttons.
 * Renders in the Live tab of the Control Room.
 *
 * Rules followed:
 * - No new styles, only existing Tailwind utility classes and design tokens.
 * - Reads from useSimulator (Zustand), which owns a SimulatedSource internally.
 * - The panel is the ONLY React code that imports simulator-engine; everything
 *   else depends on the QueueSource interface.
 */

import { useEffect } from "react";
import { Gauge } from "lucide-react";
import { StatusChip } from "@/components/axiom/StatusChip";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/axiom/format";
import { useSimulator, type JunctionLiveReading } from "@/lib/simulator-engine";
import type { ScenarioName } from "@/lib/sources/simulated";

const SCENARIOS: ScenarioName[] = ["Jam Mandi House", "Jam ITO", "Clear all"];

export function SimulatorPanel() {
  const { readings, startTicking, stopTicking, setDensity, applyScenario } = useSimulator();

  // Start the 2-second tick when this panel mounts; stop on unmount.
  useEffect(() => {
    startTicking();
    return () => stopTicking();
  }, [startTicking, stopTicking]);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
          Simulator controls
        </CardTitle>
        <div className="flex gap-2">
          {SCENARIOS.map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => applyScenario(s)}
              className="text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {readings.map((r) => (
            <JunctionSlider key={r.junctionId} reading={r} onDensity={setDensity} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function JunctionSlider({
  reading,
  onDensity,
}: {
  reading: JunctionLiveReading;
  onDensity: (id: string, density: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{reading.name}</span>
        <StatusChip status={reading.status} size="sm" />
      </div>

      <Slider
        min={0}
        max={100}
        step={1}
        value={[reading.density]}
        onValueChange={([v]) => v !== undefined && onDensity(reading.junctionId, v)}
        aria-label={`${reading.name} queue density`}
        className="cursor-pointer"
      />

      <div className="tnum flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {reading.vehicleCount} veh · {formatDuration(reading.clearTime)}
        </span>
        <span>ETA {formatDuration(reading.eta)}</span>
      </div>
    </div>
  );
}
