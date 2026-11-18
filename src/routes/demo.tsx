import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Ambulance,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Laptop,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/axiom/BrandMark";
import { useSimClient } from "@/lib/use-sim-client";
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
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [scriptRunning, setScriptRunning] = useState(false);
  const [scriptStep, setScriptStep] = useState<number>(0);
  const [caption, setCaption] = useState<string>("Ready for demo. Press 'Run Scripted Demo' or interact manually.");
  const timerRef = useRef<NodeJS.Timeout[]>([]);

  const { sendCommand } = useSimClient();

  const stopScript = () => {
    for (const t of timerRef.current) clearTimeout(t);
    timerRef.current = [];
    setScriptRunning(false);
    setScriptStep(0);
    setCaption("Demo stopped. Resetting simulation...");
    sendCommand({ type: "RESTART_TRIP" });
    setTimeout(() => {
      setCaption("Ready for demo. Press 'Run Scripted Demo' or interact manually.");
    }, 1500);
  };

  const runScriptedDemo = () => {
    for (const t of timerRef.current) clearTimeout(t);
    timerRef.current = [];
    setScriptRunning(true);
    setScriptStep(1);

    // Step 1: Start trip at 4x speed
    setCaption("Step 1/5: Starting ambulance trip at 4x speed (departing Connaught Place)...");
    sendCommand({ type: "RESTART_TRIP" });
    sendCommand({ type: "SET_SPEED", speed: 4 });

    // Step 2: After 4s real time (ambulance approaching Mandi House), jam Mandi House
    const t1 = setTimeout(() => {
      setScriptStep(2);
      setCaption("Step 2/5: Congestion detected at Mandi House! Dispatching alert to Officer SI Kavita Rawat...");
      sendCommand({ type: "SET_DENSITY", junctionId: "mandi", density: 85 });
    }, 4000);

    // Step 3: After 8s real time, officer acknowledges & clears Mandi House
    const t2 = setTimeout(() => {
      setScriptStep(3);
      setCaption("Step 3/5: Officer acknowledges alert, marks in position — green corridor draining lane (3x rate)...");
      sendCommand({ type: "ACKNOWLEDGE_ALERT", alertId: "mandi-alert", officerId: "off-mandi-1" });
      setTimeout(() => {
        sendCommand({ type: "IN_POSITION", alertId: "mandi-alert", officerId: "off-mandi-1" });
        setTimeout(() => {
          sendCommand({ type: "ROAD_CLEARED", alertId: "mandi-alert", officerId: "off-mandi-1" });
        }, 3000);
      }, 2000);
    }, 9000);

    // Step 4: After 18s real time (approaching ITO), jam ITO and let it escalate (demonstrating timeout)
    const t3 = setTimeout(() => {
      setScriptStep(4);
      setCaption("Step 4/5: Critical queue at ITO! Primary officer is engaged — observe 30s timeout countdown...");
      sendCommand({ type: "SET_DENSITY", junctionId: "ito", density: 90 });
    }, 17000);

    // Step 5: After 35s real time, backup officer clears or ambulance reroutes via Ring Road
    const t4 = setTimeout(() => {
      setScriptStep(5);
      setCaption("Step 5/5: Auto-escalated to backup! Corridor secured — ambulance proceeding smoothly to AIIMS.");
    }, 32000);

    // Done
    const t5 = setTimeout(() => {
      setScriptRunning(false);
      setCaption("Demo complete! Trip arrived at AIIMS Hospital. View the Report tab for full analytics.");
    }, 45000);

    timerRef.current = [t1, t2, t3, t4, t5];
  };

  useEffect(() => {
    return () => {
      for (const t of timerRef.current) clearTimeout(t);
    };
  }, []);

  const checklistItems = [
    {
      step: "1",
      title: "Start Trip",
      desc: "Tap 'Start trip' in Control Room or on Driver phone. Ambulance departs Connaught Place towards AIIMS.",
    },
    {
      step: "2",
      title: "Jam Mandi House",
      desc: "Use Demo Tools > 'Jam Mandi House'. The junction turns CRITICAL along the path.",
    },
    {
      step: "3",
      title: "Watch Officer Phone",
      desc: "Officer phone auto-follows to Mandi House officer, sounds emergency siren, and shows the 30s countdown.",
    },
    {
      step: "4",
      title: "Clear Junction",
      desc: "Tap 'Acknowledge' then 'In Position' on Officer phone. 3x priority drainage begins.",
    },
    {
      step: "5",
      title: "Observe Escalation",
      desc: "Jam ITO and let countdown expire. Watch auto-escalation to the backup officer.",
    },
    {
      step: "6",
      title: "View Report",
      desc: "Switch to Report tab. See trip logs, minutes saved, and click 'Export trips CSV'.",
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
              title="Return to home"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <BrandMark />
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary tracking-wide uppercase">
                3-in-1 Live Demo
              </span>
              <span className="hidden text-xs text-slate-400 sm:inline">
                Control Room · Driver · Officer
              </span>
            </div>
          </div>

          {/* Scripted Demo controls */}
          <div className="flex items-center gap-2">
            {!scriptRunning ? (
              <Button
                size="sm"
                onClick={runScriptedDemo}
                className="gap-1.5 bg-primary text-primary-foreground font-semibold text-xs shadow-md"
              >
                <Play className="size-3.5 fill-current" />
                Run scripted demo
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopScript}
                className="gap-1.5 font-semibold text-xs shadow-md"
              >
                <Square className="size-3.5 fill-current" />
                Stop demo
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setChecklistOpen((v) => !v)}
              className="h-8 border-slate-700 bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <Sparkles className="mr-1.5 size-3.5 text-primary" />
              Checklist
              {checklistOpen ? (
                <ChevronUp className="ml-1.5 size-3.5" />
              ) : (
                <ChevronDown className="ml-1.5 size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* Live Narration Caption Bar */}
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-slate-200">
          <span className="flex size-2 rounded-full bg-primary animate-ping shrink-0" />
          <span className="font-semibold text-primary">LIVE NARRATION:</span>
          <span className="font-medium text-slate-100 truncate">{caption}</span>
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
      <main className="flex-1 p-3 flex flex-col xl:flex-row gap-4 overflow-x-auto min-h-0">
        {/* Pane 1: Control Room Dashboard (Desktop) */}
        <section className="flex flex-col flex-1 min-w-[560px] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
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
          <div className="flex-1 min-h-[720px] bg-background">
            <iframe
              src="/control"
              title="Control Room View"
              className="h-full w-full border-0"
            />
          </div>
        </section>

        {/* Pane 2: Ambulance Driver HUD (Mobile Frame 380x760) */}
        <section className="flex flex-col shrink-0 w-full sm:w-[380px] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
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
            <div className="relative h-[740px] w-[360px] rounded-[44px] border-[6px] border-slate-800 bg-black shadow-2xl overflow-hidden ring-1 ring-slate-700/50">
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
        <section className="flex flex-col shrink-0 w-full sm:w-[360px] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
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
            <div className="relative h-[720px] w-[340px] rounded-[36px] border-[5px] border-slate-800 bg-black shadow-2xl overflow-hidden ring-1 ring-slate-700/50">
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
