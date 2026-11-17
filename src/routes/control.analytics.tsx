import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Clock, Download, Timer } from "lucide-react";
import { EmptyState } from "@/components/axiom/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/control/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics | Axiom-EMS Control Room" },
      { name: "description", content: "Officer response times, minutes saved per trip and CSV export." },
      { property: "og:title", content: "Analytics | Axiom-EMS Control Room" },
      { property: "og:description", content: "Response times, minutes saved and CSV export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Analytics fill in after the first completed trip.</p>
        <Button variant="outline" disabled>
          <Download aria-hidden />
          Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { title: "Officer response times", icon: Timer, body: "Time from alert sent to acknowledged, per officer." },
          { title: "Minutes saved", icon: Clock, body: "Unmanaged travel time minus managed travel time, per trip." },
          { title: "Alerts by junction", icon: BarChart3, body: "How often each junction turned critical." },
        ].map((c) => (
          <Card key={c.title} className="rounded-lg shadow-none">
            <CardHeader className="px-4 pb-0 pt-4">
              <CardTitle className="text-base font-semibold">{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <EmptyState icon={c.icon} title="No trips yet" body={c.body} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
