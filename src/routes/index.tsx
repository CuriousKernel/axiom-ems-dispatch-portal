import { createFileRoute, Link } from "@tanstack/react-router";
import { Ambulance, ArrowRight, ChevronRight, MonitorDot, Sparkles, UserRound } from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { BrandMark } from "@/components/axiom/BrandMark";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Axiom-EMS | Delhi Ambulance Corridor Coordination" },
      {
        name: "description",
        content:
          "Predictive green corridor coordination for Delhi Traffic Police. Control Room, Ambulance Driver and Traffic Officer screens.",
      },
      { property: "og:title", content: "Axiom-EMS | Delhi Ambulance Corridor" },
      {
        property: "og:description",
        content: "Predictive ambulance corridor alerts for Delhi Traffic Police. Connaught Place to AIIMS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <BrandMark />
        <ConnectionChip />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-12 text-center items-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft/50 px-3 py-1 text-xs font-semibold text-primary mb-4">
          <span className="size-2 rounded-full bg-primary" />
          <span>Delhi Ambulance Corridor · Connaught Place to AIIMS</span>
        </div>

        <h1 className="text-display sm:text-hero font-extrabold tracking-tight text-balance max-w-3xl">
          Predictive corridor clearing for emergency ambulances.
        </h1>

        <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl text-balance">
          Axiom-EMS predicts which intersections will still have traffic queues when an emergency ambulance arrives, alerting the traffic officer in advance to clear the lane.
        </p>

        {/* ONE BIG PRIMARY BUTTON */}
        <div className="mt-10">
          <Link to="/demo">
            <Button size="touch-xl" className="h-14 px-8 text-base font-bold shadow-xl gap-2">
              <Sparkles className="size-5" />
              Open Live 3-in-1 Demo
              <ArrowRight className="size-5 ml-1" />
            </Button>
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Runs Control Room, Ambulance Driver HUD, and Officer phone side-by-side
          </p>
        </div>

        {/* 3 SMALLER SECONDARY BUTTONS */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/control">
            <Button variant="outline" size="sm" className="gap-2 h-10 px-4 text-xs font-medium">
              <MonitorDot className="size-4 text-muted-foreground" />
              Control Room
            </Button>
          </Link>
          <Link to="/driver">
            <Button variant="outline" size="sm" className="gap-2 h-10 px-4 text-xs font-medium">
              <Ambulance className="size-4 text-muted-foreground" />
              Ambulance Driver
            </Button>
          </Link>
          <Link to="/officer">
            <Button variant="outline" size="sm" className="gap-2 h-10 px-4 text-xs font-medium">
              <UserRound className="size-4 text-muted-foreground" />
              Traffic Officer
            </Button>
          </Link>
        </div>
      </main>

      <AppFooter className="border-t" />
    </div>
  );
}
