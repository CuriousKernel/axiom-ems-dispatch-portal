import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorridorMapProps } from "./map-types";

const CorridorMap = lazy(() => import("./CorridorMap"));

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
      <MapPin className="size-4 animate-pulse" aria-hidden />
      Loading map
    </div>
  );
}

export function MapFrame({ className, ...props }: CorridorMapProps) {
  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <CorridorMap {...props} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
