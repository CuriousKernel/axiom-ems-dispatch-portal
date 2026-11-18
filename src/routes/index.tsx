import { createFileRoute, Link } from "@tanstack/react-router";
import { Ambulance, ArrowRight, ChevronRight, MonitorDot, Sparkles, UserRound } from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { BrandMark } from "@/components/axiom/BrandMark";
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

const ROLES = [
  {
    to: "/control",
    icon: MonitorDot,
    title: "Control Room",
    desc: "Dispatcher laptop — live corridor map, junction status, officer alerts, analytics.",
    accent: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    to: "/driver",
    icon: Ambulance,
    title: "Ambulance Driver",
    desc: "Driver phone — route, next junction, corridor status, turn-by-turn navigation.",
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    to: "/officer",
    icon: UserRound,
    title: "Traffic Officer",
    desc: "Officer phone — receive alerts, acknowledge, clear junctions for the ambulance.",
    accent: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
] as const;

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <BrandMark />
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
          Simulated data
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-12 text-center items-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft/50 px-3 py-1 text-xs font-semibold text-primary mb-4">
          <span className="size-2 rounded-full bg-primary" />
          <span>Delhi Ambulance Corridor · Connaught Place → AIIMS</span>
        </div>

        <h1 className="text-display sm:text-hero font-extrabold tracking-tight text-balance max-w-3xl">
          Predictive corridor clearing for emergency ambulances.
        </h1>

        <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl text-balance">
          Axiom-EMS predicts which intersections will still have traffic queues when an emergency ambulance arrives, alerting the traffic officer in advance to clear the lane.
        </p>

        {/* PRIMARY: 3-in-1 Demo */}
        <div className="mt-10">
          <Link to="/demo">
            <Button size="touch-xl" className="h-14 px-8 text-base font-bold shadow-xl gap-2">
              <Sparkles className="size-5" />
              Open Live 3-in-1 Demo
              <ArrowRight className="size-5 ml-1" />
            </Button>
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Runs Control Room, Driver, and Officer side-by-side · Recommended for judges
          </p>
        </div>

        {/* ROLE CARDS */}
        <div className="mt-10 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Link key={r.to} to={r.to}>
              <div className={`group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all hover:shadow-lg hover:scale-[1.02] ${r.bg}`}>
                <div className={`flex size-10 items-center justify-center rounded-lg bg-background shadow-sm border ${r.accent}`}>
                  <r.icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    {r.title}
                    <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <AppFooter className="border-t" />
    </div>
  );
}
