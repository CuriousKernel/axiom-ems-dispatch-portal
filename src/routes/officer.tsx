import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Bell, CircleCheck, History, Inbox, ShieldCheck, Timer } from "lucide-react";
import { AppFooter } from "@/components/axiom/AppFooter";
import { ConnectionChip } from "@/components/axiom/ConnectionChip";
import { MapFrame } from "@/components/axiom/MapFrame";
import { Chip, StatusChip } from "@/components/axiom/StatusChip";
import { EmptyState } from "@/components/axiom/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/axiom/format";
import {
  AMBULANCE,
  DEFAULT_OFFICER_ID,
  MOCK_OFFICER_HISTORY,
  junctionById,
  officerById,
  readingFor,
} from "@/lib/axiom/seed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/officer")({
  head: () => ({
    meta: [
      { title: "Officer | Axiom-EMS" },
      { name: "description", content: "Traffic officer screen: receive ambulance alerts for your junction, act and confirm." },
      { property: "og:title", content: "Officer | Axiom-EMS" },
      { property: "og:description", content: "Receive ambulance alerts for your junction, act and confirm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfficerView,
});

type Tab = "now" | "history";

function OfficerView() {
  const [tab, setTab] = useState<Tab>("now");
  const officer = officerById(DEFAULT_OFFICER_ID)!;
  const junction = junctionById(officer.junctionId)!;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <Link
          to="/"
          aria-label="Change role"
          className="-ml-2 flex size-12 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">
            {officer.rank} {officer.name}
          </p>
          <p className="truncate text-sm text-muted-foreground">{junction.name}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-clear-ink">
          <span className={cn("size-2.5 rounded-full", officer.online ? "bg-clear" : "bg-muted-foreground")} />
          {officer.online ? "Online" : "Offline"}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto">{tab === "now" ? <NowTab /> : <HistoryTab />}</main>

      <AppFooter />

      {/* Bottom tabs, 64px touch targets */}
      <nav className="grid grid-cols-2 border-t bg-card" aria-label="Officer sections">
        {(
          [
            { id: "now", label: "Now", icon: Bell },
            { id: "history", label: "History", icon: History },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              tab === t.id ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-5" aria-hidden />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function NowTab() {
  const officer = officerById(DEFAULT_OFFICER_ID)!;
  const junction = junctionById(officer.junctionId)!;
  const reading = readingFor(junction.id)!;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <ConnectionChip />
        <StatusChip status={reading.status} />
      </div>

      <section className="flex flex-col items-center rounded-lg border bg-card px-6 py-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-clear-soft text-clear-ink">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-title font-semibold">All clear</h1>
        <p className="mt-1 text-sm text-muted-foreground">No action needed at {junction.name}.</p>

        <div className="mt-8 w-full border-t pt-6">
          <p className="text-sm text-muted-foreground">Next ambulance on corridor</p>
          <p className="tnum mt-1 text-hero font-semibold tracking-tight">{formatDuration(reading.eta)}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Timer className="size-4" aria-hidden />
            {AMBULANCE.plate}, {AMBULANCE.priority} {AMBULANCE.caseLabel.toLowerCase()}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <MapFrame
          className="h-44"
          interactive={false}
          showLabels={false}
          junctions={[{ ...junction, status: reading.status }]}
          officers={[officer]}
          focus={[junction, officer]}
        />
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-muted-foreground">You and {junction.name}</span>
          <Chip tone="neutral" icon={ShieldCheck}>
            Queue {reading.queueCount}
          </Chip>
        </div>
      </section>

      <p className="px-2 text-center text-xs text-muted-foreground">
        You'll get a full-screen alert with sound and vibration only if this junction will block an ambulance.
      </p>
    </div>
  );
}

function HistoryTab() {
  const [showAll, setShowAll] = useState(false);
  const items = MOCK_OFFICER_HISTORY;
  const visible = showAll ? items : items.slice(0, 5);
  const avg = items.length ? Math.round(items.reduce((a, b) => a + b.responseSeconds, 0) / items.length) : 0;

  if (items.length === 0)
    return <EmptyState icon={Inbox} title="No alerts yet" body="Alerts you handle will appear here with response times." />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Average response</p>
        <p className="tnum text-display font-semibold">{avg} s</p>
        <p className="text-xs text-muted-foreground">Across {items.length} alerts (sample data)</p>
      </section>

      <ul className="divide-y rounded-lg border bg-card">
        {visible.map((h) => (
          <li key={h.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{junctionById(h.junctionId)?.name}</p>
              <p className="text-xs text-muted-foreground">{h.date}</p>
            </div>
            <span className="tnum text-sm font-medium">{h.responseSeconds} s</span>
            <Chip tone={h.outcome === "Verified clear" ? "clear" : "watch"}>{h.outcome}</Chip>
          </li>
        ))}
      </ul>
      {items.length > 5 && !showAll && (
        <Button variant="ghost" size="touch" onClick={() => setShowAll(true)}>
          View all
        </Button>
      )}
    </div>
  );
}
