/**
 * src/components/axiom/SimulatorPanel.tsx
 *
 * Phase 3 control panel: density sliders per junction, scenario buttons,
 * and trip controls (start / restart trip).
 * Renders in the Live tab of the Control Room.
 */

import { useEffect } from "react";
import { Gauge, Play, RotateCcw } from "lucide-react";
import { StatusChip } from "@/components/axiom/StatusChip";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/axiom/format";
import { useSimulator } from "@/lib/simulator-engine";
import type { JunctionSimReading } from "@/lib/sim-transport";
import type { ScenarioName } from "@/lib/sources/simulated";

const SCENARIOS: ScenarioName[] = ["Jam Mandi House", "Jam ITO", "Clear all"];

export function SimulatorPanel() {
  const readings = useSimulator((s) => s.readings);
  const startEngine = useSimulator((s) => s.startEngine);
  const stopEngine = useSimulator((s) => s.stopEngine);
  const setDensity = useSimulator((s) => s.setDensity);
  const applyScenario = useSimulator((s) => s.applyScenario);
  const ambulance = useSimulator((s) => s.ambulance);
  const startTrip = useSimulator((s) => s.startTrip);
  const restartTrip = useSimulator((s) => s.restartTrip);

  useEffect(() => {
    startEngine();
    return () => stopEngine();
  }, [startEngine, stopEngine]);

  const readingList = Object.values(readings);

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
          Simulator controls
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {ambulance.status === "idle" && (
            <Button size="sm" onClick={startTrip} className="gap-1.5 text-xs">
              <Play className="size-3.5" aria-hidden />
              Start trip
            </Button>
          )}
          {ambulance.status === "arrived" && (
            <Button size="sm" variant="outline" onClick={restartTrip} className="gap-1.5 text-xs">
              <RotateCcw className="size-3.5" aria-hidden />
              Restart trip
            </Button>
          )}
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
          {readingList.map((r) => (
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
  reading: JunctionSimReading;
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
        <span>
          {reading.status === "PASSED" ? "PASSED" : `ETA ${formatDuration(reading.eta)}`}
        </span>
      </div>
    </div>
  );
}
