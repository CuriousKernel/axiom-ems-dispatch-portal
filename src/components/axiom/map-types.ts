import type { Junction, JunctionStatus, LatLng, Officer } from "@/lib/axiom/types";

export interface AmbulanceMarkerData extends LatLng {
  heading?: number | undefined;
}

export interface CorridorMapProps {
  junctions: (Junction & { status: JunctionStatus })[];
  officers?: Officer[] | undefined;
  ambulance?: AmbulanceMarkerData | null | undefined;
  /** Path already traveled (green) and path ahead (gray). */
  traveled?: LatLng[] | undefined;
  ahead?: LatLng[] | undefined;
  selectedJunctionId?: string | undefined;
  onSelectJunction?: (id: string) => void | undefined;
  dark?: boolean | undefined;
  showLabels?: boolean | undefined;
  /** Fit to these points instead of the whole corridor. */
  focus?: LatLng[] | undefined;
  interactive?: boolean | undefined;
  className?: string | undefined;
}
