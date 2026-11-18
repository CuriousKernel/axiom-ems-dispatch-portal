import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Ambulance,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Laptop,
  Maximize2,
  MonitorDot,
  Radio,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/axiom/BrandMark";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Unified Demo | Axiom-EMS" },
      {
        name: "description",
        content: "Judge-ready 3-in-1 live demo: Control Room, Ambulance Driver HUD, and Traffic Officer mobile screens.",
      },
      { property: "og:title", content: "Unified Demo | Axiom-EMS" },
      {
        property: "og:description",
        content: "Simultaneous 3-screen coordination: Control Room, Driver, and Officer in a single desktop window.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoPage,
});

export function DemoPage() {
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const checklistItems = [
    {
      step: "1",
      title: "Start Trip",
      desc: "Tap 'Start trip' in the Control Room or on the Driver phone. Ambulance departs Connaught Place towards AIIMS.",
    },
    {
      step: "2",
      title: "Jam Mandi House",
      desc: "In Control Room bottom panel, drag Mandi House slider to 80+ vehicles. The junction turns CRITICAL.",
    },
    {
      step: "3",
      title: "Watch Officer Phone",
      desc: "The Officer phone instantly auto-follows to Mandi House officer, starts emergency ringing, and shows the 30s countdown ring.",
    },
    {
      step: "4",
      title: "Clear Junction",
      desc: "Tap 'Acknowledge' then 'Mark In Position' on the Officer phone. Rapid 3x corridor drainage begins and queue drops.",
    },
    {
      step: "5",
      title: "Test 30s Escalation",
      desc: "Drag ITO slider to 90 vehicles and ignore it. Watch the real wall-clock countdown hit 0 and escalate to backup officer.",
    },
    {
      step: "6",
      title: "Inspect Analytics",
      desc: "Switch Control Room to the Analytics tab. See completed trip logs, KPI tiles, and click 'Export trips CSV'.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 antialiased selection:bg-primary selection:text-white">
      {/* ── Top Presenter Bar ─────────────────────────────────────────────── */}
      <header className="z-30 border-b border-slate-800 bg-slate-900/90 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex size-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Return to role selector"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <BrandMark />
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary tracking-wide uppercase">
                3-in-1 Judge Demo
              </span>
              <span className="hidden text-xs text-slate-400 sm:inline">
                Single-window live synchronization via BroadcastChannel
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChecklistOpen((v) => !v)}
              className="h-8 border-slate-700 bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Sparkles className="mr-1.5 size-3.5 text-primary" />
              Presenter Checklist
              {checklistOpen ? (
                <ChevronUp className="ml-1.5 size-3.5" />
              ) : (
                <ChevronDown className="ml-1.5 size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Collapsible Presenter Walkthrough Guide */}
        {checklistOpen && (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Recommended 2-Minute Judging Walkthrough
              </p>
              <span className="text-[11px] text-slate-400">
                All 3 viewports run synchronously with zero background throttling
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
              {checklistItems.map((item) => (
                <div
                  key={item.step}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 text-xs transition-colors hover:border-slate-700"
                >
                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                      {item.step}
                    </span>
                    <span>{item.title}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── 3-Pane Viewport Container ───────────────────────────────────────── */}
      <main className="flex-1 p-3 flex flex-col lg:flex-row gap-4 overflow-x-auto min-h-0">
        {/* Pane 1: Control Room Dashboard (Desktop) */}
        <section className="flex flex-col flex-1 min-w-[620px] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-2">
              <Laptop className="size-4 text-primary" />
              <span>Control Room Master View</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400 font-mono">
                /control
              </span>
            </div>
            <a
              href="/control"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
            >
              Open in new tab <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="flex-1 min-h-[750px] bg-background">
            <iframe
              src="/control"
              title="Control Room View"
              className="h-full w-full border-0"
            />
          </div>
        </section>

        {/* Pane 2: Ambulance Driver HUD (Mobile Frame 390x800) */}
        <section className="flex flex-col shrink-0 w-full sm:w-[390px] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-2">
              <Ambulance className="size-4 text-primary" />
              <span>Ambulance Driver HUD</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400 font-mono">
                /driver
              </span>
            </div>
            <a
              href="/driver"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
            >
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="p-3 flex items-center justify-center bg-slate-950 flex-1">
            {/* Realistic iPhone frame */}
            <div className="relative h-[780px] w-[370px] rounded-[44px] border-[6px] border-slate-800 bg-black shadow-2xl overflow-hidden ring-1 ring-slate-700/50">
              {/* Dynamic Island / speaker notch */}
              <div className="absolute top-2.5 left-1/2 z-40 -translate-x-1/2 h-4 w-24 rounded-full bg-black ring-1 ring-slate-800" />
              <iframe
                src="/driver?embed=1"
                title="Ambulance Driver Phone"
                className="h-full w-full border-0 bg-background"
              />
            </div>
          </div>
        </section>

        {/* Pane 3: Traffic Officer Phone (Mobile Frame 360x720) */}
        <section className="flex flex-col shrink-0 w-full sm:w-[370px] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-2">
              <Smartphone className="size-4 text-primary" />
              <span>Traffic Officer Screen</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-400 font-mono">
                /officer
              </span>
            </div>
            <a
              href="/officer"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
            >
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="p-3 flex items-center justify-center bg-slate-950 flex-1">
            {/* Realistic Android phone frame */}
            <div className="relative h-[740px] w-[350px] rounded-[36px] border-[5px] border-slate-800 bg-black shadow-2xl overflow-hidden ring-1 ring-slate-700/50">
              {/* Front camera punch-hole */}
              <div className="absolute top-2 left-1/2 z-40 -translate-x-1/2 size-3 rounded-full bg-slate-900 ring-1 ring-slate-800" />
              <iframe
                src="/officer?embed=1&follow=1"
                title="Traffic Officer Phone"
                className="h-full w-full border-0 bg-background"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
