import { createFileRoute } from "@tanstack/react-router";
import { StatusChip } from "@/components/axiom/StatusChip";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration } from "@/lib/axiom/format";
import { JUNCTIONS, officersAt, readingFor } from "@/lib/axiom/seed";

export const Route = createFileRoute("/control/junctions")({
  head: () => ({
    meta: [
      { title: "Junctions | Axiom-EMS Control Room" },
      { name: "description", content: "Every junction on the corridor with queue, clear time, ambulance ETA and status." },
      { property: "og:title", content: "Junctions | Axiom-EMS Control Room" },
      { property: "og:description", content: "Queue, clear time, ETA and status for every corridor junction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JunctionsPage,
});

function JunctionsPage() {
  return (
    <Card className="rounded-lg p-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">#</TableHead>
            <TableHead>Junction</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Queue</TableHead>
            <TableHead className="text-right">Clear time</TableHead>
            <TableHead className="text-right">Ambulance ETA</TableHead>
            <TableHead className="text-right">Discharge rate</TableHead>
            <TableHead>Camera</TableHead>
            <TableHead className="pr-4">Officers</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {JUNCTIONS.map((j, i) => {
            const r = readingFor(j.id)!;
            return (
              <TableRow key={j.id}>
                <TableCell className="tnum pl-4 text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{j.name}</TableCell>
                <TableCell><StatusChip status={r.status} /></TableCell>
                <TableCell className="tnum text-right">{r.queueCount}</TableCell>
                <TableCell className="tnum text-right">{formatDuration(r.clearTime)}</TableCell>
                <TableCell className="tnum text-right">{i === 0 ? "Start" : formatDuration(r.eta)}</TableCell>
                <TableCell className="tnum text-right">{j.dischargeRate.toFixed(1)} veh/s</TableCell>
                <TableCell className="text-muted-foreground">{j.cameraId ?? "None"}</TableCell>
                <TableCell className="pr-4 text-muted-foreground">
                  {officersAt(j.id).map((o) => `${o.rank} ${o.name}`).join(", ")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        Sample values. Density sliders and live readings arrive with the simulator.
      </p>
    </Card>
  );
}
