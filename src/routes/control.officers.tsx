import { createFileRoute } from "@tanstack/react-router";
import { Chip } from "@/components/axiom/StatusChip";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OFFICERS, junctionById } from "@/lib/axiom/seed";

export const Route = createFileRoute("/control/officers")({
  head: () => ({
    meta: [
      { title: "Officers | Axiom-EMS Control Room" },
      { name: "description", content: "Traffic officers on the corridor with assigned junction, online status and active alerts." },
      { property: "og:title", content: "Officers | Axiom-EMS Control Room" },
      { property: "og:description", content: "Officer roster with junction, online status and active alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfficersPage,
});

function OfficersPage() {
  return (
    <Card className="rounded-lg p-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Officer</TableHead>
            <TableHead>Junction</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Active alerts</TableHead>
            <TableHead className="pr-4 text-right">Position</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {OFFICERS.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="pl-4 font-medium">{o.rank} {o.name}</TableCell>
              <TableCell>{junctionById(o.junctionId)?.name}</TableCell>
              <TableCell>
                <Chip tone={o.online ? "clear" : "neutral"}>{o.online ? "Online" : "Offline"}</Chip>
              </TableCell>
              <TableCell className="tnum text-right">{o.activeAlerts}</TableCell>
              <TableCell className="tnum pr-4 text-right text-muted-foreground">
                {o.lat.toFixed(4)}, {o.lng.toFixed(4)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">All names are fictional.</p>
    </Card>
  );
}
