import { createFileRoute, Link } from "@tanstack/react-router";
import { Ambulance, ChevronRight, MonitorDot, Smartphone, UserRound, type LucideIcon } from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { BrandMark } from "@/components/axiom/BrandMark";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Axiom-EMS | Choose your role" },
      {
        name: "description",
        content:
          "Axiom-EMS helps Delhi Traffic Police clear the way for ambulances. Open the Officer, Driver or Control Room screen.",
      },
      { property: "og:title", content: "Axiom-EMS | Choose your role" },
      {
        property: "og:description",
        content: "Advisory ambulance corridor alerts. Officer, Ambulance Driver and Control Room screens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoleSelector,
});

type Role = {
  to: "/officer" | "/driver" | "/control";
  title: string;
  body: string;
  icon: LucideIcon;
  device: string;
  deviceIcon: LucideIcon;
};

const ROLES: Role[] = [
  {
    to: "/officer",
    title: "Traffic Officer",
    body: "Get an alert only when your junction will block the ambulance. Acknowledge, clear, confirm.",
    icon: UserRound,
    device: "Phone",
    deviceIcon: Smartphone,
  },
  {
    to: "/driver",
    title: "Ambulance Driver",
    body: "Huge ETA, next junction status and reroute instructions you can read at a glance.",
    icon: Ambulance,
    device: "Phone",
    deviceIcon: Smartphone,
  },
  {
    to: "/control",
    title: "Control Room",
    body: "Watch the whole corridor live: junctions, officers, alerts and minutes saved.",
    icon: MonitorDot,
    device: "Desktop",
    deviceIcon: MonitorDot,
  },
];

function RoleSelector() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <BrandMark />
        <ConnectionChip />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-12">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Delhi ambulance corridor, Connaught Place to AIIMS</p>
          <h1 className="mt-2 text-display font-semibold tracking-tight text-balance">
            We don't replace the police, we make them 10x more effective.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Axiom-EMS predicts which junctions will still be blocked when an ambulance arrives and
            alerts only the nearest officer. Choose your screen.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {ROLES.map((r) => (
            <li key={r.to}>
              <Link
                to={r.to}
                className="group flex h-full flex-col rounded-lg border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-12 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <r.icon className="size-6" aria-hidden />
                </span>
                <span className="mt-5 flex items-center justify-between">
                  <span className="text-title font-semibold">{r.title}</span>
                  <ChevronRight
                    className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </span>
                <span className="mt-2 flex-1 text-sm text-muted-foreground">{r.body}</span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <r.deviceIcon className="size-3.5" aria-hidden />
                  Best on {r.device.toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <AppFooter className="border-t" />
    </div>
  );
}
