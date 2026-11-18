import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Camera,
  Car,
  CheckCircle2,
  Cpu,
  Eye,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JUNCTIONS } from "@/lib/axiom/seed";
import { useSimulator } from "@/lib/simulator-engine";
import { formatDuration } from "@/lib/axiom/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/control/vision")({
  head: () => ({
    meta: [
      { title: "AI Vision Feeds | Axiom-EMS Control Room" },
      {
        name: "description",
        content: "Edge AI traffic camera vehicle detection and automated queue estimation for emergency corridors.",
      },
      { property: "og:title", content: "AI Vision Feeds | Axiom-EMS Control Room" },
      {
        property: "og:description",
        content: "Automated vehicle detection, bounding boxes and queue depth analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisionPage,
});

interface DetectedVehicle {
  id: number;
  x: number;
  y: number;
  speed: number;
  lane: number;
  type: "car" | "auto" | "bus" | "motorcycle";
  confidence: number;
}

export function VisionPage() {
  const cameraJunctions = useMemo(
    () => JUNCTIONS.filter((j) => j.cameraId !== null),
    [],
  );

  const [selectedJunctionId, setSelectedJunctionId] = useState<string>(cameraJunctions[0]?.id ?? "cp");
  const [feedMode, setFeedMode] = useState<"simulated" | "video">("simulated");
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);
  const [detectionConfidence, setDetectionConfidence] = useState(85);

  const setDensity = useSimulator((s) => s.setDensity);
  const readings = useSimulator((s) => s.readings);

  const currentJunction = JUNCTIONS.find((j) => j.id === selectedJunctionId) ?? cameraJunctions[0]!;
  const currentReading = readings[selectedJunctionId];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vehiclesRef = useRef<DetectedVehicle[]>([]);
  const nextVehId = useRef(1);

  // Initialize simulated vehicles
  useEffect(() => {
    const vehs: DetectedVehicle[] = [];
    const count = Math.min(30, Math.max(6, Math.round((currentReading?.vehicleCount ?? 15) * 0.8)));
    const types: DetectedVehicle["type"][] = ["car", "car", "auto", "car", "bus", "motorcycle"];

    for (let i = 0; i < count; i++) {
      const lane = Math.floor(Math.random() * 3);
      vehs.push({
        id: nextVehId.current++,
        x: 60 + Math.random() * 520,
        y: 80 + lane * 70 + (Math.random() * 20 - 10),
        speed: 0.6 + Math.random() * 1.2,
        lane,
        type: types[Math.floor(Math.random() * types.length)]!,
        confidence: 0.82 + Math.random() * 0.16,
      });
    }
    vehiclesRef.current = vehs;
  }, [selectedJunctionId, currentReading?.vehicleCount]);

  // Simulation 2D Canvas rendering loop
  useEffect(() => {
    if (feedMode !== "simulated") return;

    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Dark asphalt road background
      ctx.fillStyle = "#1e2430";
      ctx.fillRect(0, 0, w, h);

      // Road boundaries and 3 lanes
      ctx.fillStyle = "#27303f";
      ctx.fillRect(0, 60, w, 220);

      // Lane dividers (dashed lines)
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 16]);

      ctx.beginPath();
      ctx.moveTo(0, 130);
      ctx.lineTo(w, 130);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, 200);
      ctx.lineTo(w, 200);
      ctx.stroke();

      ctx.setLineDash([]);

      // Emergency Green Corridor lane highlight (top lane)
      ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
      ctx.fillRect(0, 60, w, 70);

      // Road edge lines
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 60);
      ctx.lineTo(w, 60);
      ctx.moveTo(0, 280);
      ctx.lineTo(w, 280);
      ctx.stroke();

      // Virtual AI Counting Line
      ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(w - 120, 60);
      ctx.lineTo(w - 120, 280);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
      ctx.font = "bold 10px monospace";
      ctx.fillText("CORRIDOR STOP LINE", w - 115, 52);

      // Draw and advance vehicles
      const vehs = vehiclesRef.current;
      for (const v of vehs) {
        // Move towards intersection (rightwards)
        v.x += v.speed;
        if (v.x > w + 40) {
          v.x = -60;
          v.y = 80 + v.lane * 70 + (Math.random() * 20 - 10);
        }

        // Vehicle dimension by type
        let vw = 46;
        let vh = 24;
        let color = "#38bdf8";

        if (v.type === "bus") {
          vw = 72;
          vh = 28;
          color = "#fbbf24";
        } else if (v.type === "auto") {
          vw = 30;
          vh = 20;
          color = "#34d399";
        } else if (v.type === "motorcycle") {
          vw = 24;
          vh = 12;
          color = "#c084fc";
        }

        // Vehicle body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(v.x, v.y - vh / 2, vw, vh, 4);
        ctx.fill();

        // Windshield
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(v.x + vw - 14, v.y - vh / 2 + 3, 5, vh - 6);

        // Bounding box overlay
        if (showBoundingBoxes) {
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(v.x - 3, v.y - vh / 2 - 3, vw + 6, vh + 6);

          // Class and confidence label
          if (showConfidence) {
            ctx.fillStyle = "#22c55e";
            ctx.fillRect(v.x - 3, v.y - vh / 2 - 16, 52, 12);
            ctx.fillStyle = "#000000";
            ctx.font = "bold 8px sans-serif";
            const confPct = Math.round(v.confidence * 100);
            ctx.fillText(`${v.type} ${confPct}%`, v.x, v.y - vh / 2 - 7);
          }
        }
      }

      // HUD Overlay in top corner
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.roundRect(12, 12, 220, 36, 6);
      ctx.fill();

      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`CAM: ${currentJunction.cameraId?.toUpperCase()} [LIVE]`, 20, 26);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px sans-serif";
      ctx.fillText(`FPS: 30 · YOLOv8 Edge · Obj: ${vehs.length}`, 20, 40);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [feedMode, showBoundingBoxes, showConfidence, currentJunction]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">CCTV Edge AI Vision</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Phase 5 Preview
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Real-time optical queue estimation and clearance verification using intersection camera feeds.
          </p>
        </div>

        {/* Junction Camera Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Camera:</span>
          <div className="flex rounded-lg border bg-card p-1 gap-1">
            {cameraJunctions.map((j) => (
              <Button
                key={j.id}
                variant={selectedJunctionId === j.id ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setSelectedJunctionId(j.id)}
              >
                <Camera className="mr-1 size-3" />
                {j.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Camera Feed on Left, AI Inference Controls on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-[68fr_32fr] gap-6">
        {/* Camera Feed Card */}
        <Card className="overflow-hidden shadow-none border bg-card flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 px-4 py-3 space-y-0">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <CardTitle className="text-sm font-semibold">
                {currentJunction.name} · {currentJunction.cameraId}
              </CardTitle>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1.5 bg-muted rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFeedMode("simulated")}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition-colors",
                  feedMode === "simulated" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                Simulated Camera
              </button>
              <button
                type="button"
                onClick={() => setFeedMode("video")}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition-colors",
                  feedMode === "video" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                Sample Video Mode
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-0 bg-slate-950 relative flex items-center justify-center min-h-[420px]">
            {feedMode === "simulated" ? (
              <canvas
                ref={canvasRef}
                width={720}
                height={340}
                className="w-full h-auto max-h-[420px] object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-slate-300">
                <div className="size-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                  <Video className="size-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Live Edge Camera Gateway</h3>
                  <p className="mt-1 text-xs text-slate-400 max-w-sm">
                    Connects directly to Delhi Police CCTV RTSP video streams via WebRTC / HLS.
                    Switch to &quot;Simulated Camera&quot; to test the real-time AI bounding box detector.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setFeedMode("simulated")}
                  className="mt-2 text-xs"
                >
                  <Eye className="mr-1.5 size-3.5" />
                  View Simulated Detection Feed
                </Button>
              </div>
            )}
          </CardContent>

          {/* Feed Footer Bar */}
          <div className="flex flex-wrap items-center justify-between border-t bg-card px-4 py-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground">Inference engine:</span>{" "}
                <strong className="text-foreground">Edge YOLO-v8 (TensorRT)</strong>
              </div>
              <div className="border-l pl-4">
                <span className="text-muted-foreground">Resolution:</span>{" "}
                <strong className="text-foreground">1280x720 @ 30fps</strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setDensity(selectedJunctionId, 85);
                }}
              >
                Inject Jam (+85% density)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setDensity(selectedJunctionId, 0);
                }}
              >
                Clear Jam
              </Button>
            </div>
          </div>
        </Card>

        {/* AI Analytics & Inference Stats Panel */}
        <div className="flex flex-col gap-4">
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                Optical Queue Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground uppercase font-bold">Detected Queue</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">
                    {currentReading ? currentReading.vehicleCount : 12} veh
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-[11px] text-muted-foreground uppercase font-bold">Estimated Clear</p>
                  <p className="text-2xl font-bold text-clear mt-0.5">
                    {currentReading ? formatDuration(currentReading.clearTime) : "24s"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Lane 1 (Corridor):</span>
                  <span className="text-clear font-bold flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Priority Flow
                  </span>
                </div>
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Lane 2 (Straight):</span>
                  <span>Moderate Queue</span>
                </div>
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Lane 3 (Right Turn):</span>
                  <span>Light Queue</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detector Controls */}
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                Vision Pipeline Overlay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span>Show Bounding Boxes</span>
                <input
                  type="checkbox"
                  checked={showBoundingBoxes}
                  onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                  className="rounded border"
                />
              </div>

              <div className="flex items-center justify-between border-t pt-2">
                <span>Show Class & Confidence</span>
                <input
                  type="checkbox"
                  checked={showConfidence}
                  onChange={(e) => setShowConfidence(e.target.checked)}
                  className="rounded border"
                />
              </div>

              <div className="space-y-1 border-t pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Confidence Threshold:</span>
                  <span className="font-bold">{detectionConfidence}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={98}
                  value={detectionConfidence}
                  onChange={(e) => setDetectionConfidence(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
