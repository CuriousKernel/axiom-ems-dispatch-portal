// Browser-only: imported lazily through MapFrame. Never import this module from a route.
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { CorridorMapProps } from "./map-types";

const ICONS = {
  CLEAR: '<path d="M20 6 9 17l-5-5"/>',
  WATCH:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  CRITICAL: '<path d="M12 8v4"/><path d="M12 16h.01"/><circle cx="12" cy="12" r="9"/>',
  AMBULANCE: '<path d="M12 6v12"/><path d="M6 12h12"/>',
};

const svg = (inner: string, w = 2.5) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0]!, 16);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function CorridorMap({
  junctions,
  officers = [],
  ambulance,
  traveled = [],
  ahead = [],
  selectedJunctionId,
  onSelectJunction,
  dark,
  showLabels = true,
  focus,
  interactive = true,
  className,
}: CorridorMapProps) {
  const fitPoints = useMemo<[number, number][]>(
    () => (focus ?? junctions).map((p) => [p.lat, p.lng]),
    [focus, junctions],
  );

  // Esri Canvas basemap: free with attribution, no key, calm gray style that works from any host.
  const base = dark ? "World_Dark_Gray" : "World_Light_Gray";
  const tiles = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}_Base/MapServer/tile/{z}/{y}/{x}`;
  const labels = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}_Reference/MapServer/tile/{z}/{y}/{x}`;

  return (
    <MapContainer
      center={[28.605, 77.235]}
      zoom={13}
      maxZoom={16}
      className={className ?? ""}
      style={{ height: "100%", width: "100%" }}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      attributionControl
    >
      <TileLayer
        key={tiles}
        url={tiles}
        maxZoom={16}
        attribution="Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
      />
      <TileLayer key={labels} url={labels} maxZoom={16} />
      <FitBounds points={fitPoints} />

      {ahead.length > 1 && (
        <Polyline
          positions={ahead.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ className: "axm-path-ahead", weight: 5, dashArray: "2 8" }}
        />
      )}
      {traveled.length > 1 && (
        <Polyline
          positions={traveled.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ className: "axm-path-traveled", weight: 6 }}
        />
      )}

      {officers.map((o) => (
        <Marker
          key={o.id}
          position={[o.lat, o.lng]}
          icon={L.divIcon({
            className: "",
            html: `<div class="axm-officer ${o.online ? "" : "axm-officer--offline"}"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })}
        >
          <Tooltip direction="top" offset={[0, -8]} className="axm-label">
            {o.rank} {o.name} {o.online ? "" : "(offline)"}
          </Tooltip>
        </Marker>
      ))}

      {junctions.map((j) => {
        const cls = `axm-junction axm-junction--${j.status.toLowerCase()} ${
          selectedJunctionId === j.id ? "axm-junction--selected" : ""
        }`;
        return (
          <Marker
            key={`${j.id}-${j.status}-${selectedJunctionId === j.id}`}
            position={[j.lat, j.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div class="${cls}" role="img" aria-label="${j.name}: ${j.status}">${svg(ICONS[j.status], 3)}</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            })}
            eventHandlers={onSelectJunction ? { click: () => onSelectJunction(j.id) } : {}}
          >
            {showLabels && (
              <Tooltip permanent direction="right" offset={[16, 0]} className="axm-label">
                {j.name}
              </Tooltip>
            )}
          </Marker>
        );
      })}

      {ambulance && (
        <Marker
          position={[ambulance.lat, ambulance.lng]}
          zIndexOffset={1000}
          icon={L.divIcon({
            className: "",
            html: `<div class="axm-ambulance" role="img" aria-label="Ambulance">${svg(ICONS.AMBULANCE, 3)}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          })}
        />
      )}
    </MapContainer>
  );
}
