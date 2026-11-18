// Browser-only: imported lazily through MapFrame. Never import this module from a route.
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { AmbulanceMarkerData, CorridorMapProps } from "./map-types";

const ICONS = {
  CLEAR: '<path d="M20 6 9 17l-5-5"/>',
  WATCH:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  CRITICAL: '<path d="M12 8v4"/><path d="M12 16h.01"/><circle cx="12" cy="12" r="9"/>',
  PASSED: '<path d="M20 6 9 17l-5-5"/>',
  AMBULANCE: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
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

function DriverFollowCamera({
  ambulance,
  onUserDragAway,
  recenterTrigger,
}: {
  ambulance?: AmbulanceMarkerData | null | undefined;
  onUserDragAway?: (() => void) | undefined;
  recenterTrigger?: number | undefined;
}) {
  const map = useMap();
  const isFollowing = useRef(true);

  // Recenter trigger from parent
  useEffect(() => {
    if (recenterTrigger !== undefined && ambulance) {
      isFollowing.current = true;
      map.setView([ambulance.lat, ambulance.lng], 16, { animate: true });
    }
  }, [recenterTrigger, map, ambulance]);

  // Detect user drag away
  useEffect(() => {
    const handleDrag = () => {
      if (isFollowing.current) {
        isFollowing.current = false;
        onUserDragAway?.();
      }
    };
    map.on("dragstart", handleDrag);
    return () => {
      map.off("dragstart", handleDrag);
    };
  }, [map, onUserDragAway]);

  // Smooth follow ambulance
  useEffect(() => {
    if (isFollowing.current && ambulance) {
      map.panTo([ambulance.lat, ambulance.lng], { animate: true, duration: 0.35 });
    }
  }, [ambulance?.lat, ambulance?.lng, map]);

  return null;
}

export default function CorridorMap({
  variant = "control",
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
  onUserDragAway,
  recenterTrigger,
}: CorridorMapProps) {
  const fitPoints = useMemo<[number, number][]>(
    () => (focus ?? junctions).map((p) => [p.lat, p.lng]),
    [focus, junctions],
  );

  const isDriver = variant === "driver";

  // Esri Canvas basemap: free with attribution, no key, calm gray style that works from any host.
  const base = dark ? "World_Dark_Gray" : "World_Light_Gray";
  const esriTiles = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}_Base/MapServer/tile/{z}/{y}/{x}`;
  const esriLabels = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}_Reference/MapServer/tile/{z}/{y}/{x}`;

  // Driver basemap: clean light CARTO Voyager tiles
  const cartoVoyager = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  return (
    <MapContainer
      center={ambulance ? [ambulance.lat, ambulance.lng] : [28.605, 77.235]}
      zoom={isDriver ? 16 : 13}
      maxZoom={isDriver ? 18 : 16}
      className={className ?? ""}
      style={{ height: "100%", width: "100%" }}
      zoomControl={interactive && !isDriver}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      attributionControl
    >
      {isDriver ? (
        <TileLayer
          key="carto-voyager"
          url={cartoVoyager}
          subdomains="abcd"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
      ) : (
        <>
          <TileLayer
            key={esriTiles}
            url={esriTiles}
            maxZoom={16}
            attribution="Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          />
          <TileLayer key={esriLabels} url={esriLabels} maxZoom={16} />
        </>
      )}

      {isDriver ? (
        <DriverFollowCamera
          ambulance={ambulance}
          onUserDragAway={onUserDragAway}
          recenterTrigger={recenterTrigger}
        />
      ) : (
        <FitBounds points={fitPoints} />
      )}

      {/* Traveled Route Polyline */}
      {traveled.length > 1 && (
        <>
          {isDriver && (
            <Polyline
              positions={traveled.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ className: "axm-path-driver-casing", weight: 9 }}
            />
          )}
          <Polyline
            positions={traveled.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={
              isDriver
                ? { className: "axm-path-driver-traveled", weight: 6 }
                : { className: "axm-path-traveled", weight: 6 }
            }
          />
        </>
      )}

      {/* Ahead Route Polyline */}
      {ahead.length > 1 && (
        <>
          {isDriver && (
            <Polyline
              positions={ahead.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ className: "axm-path-driver-casing", weight: 12 }}
            />
          )}
          <Polyline
            positions={ahead.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={
              isDriver
                ? { className: "axm-path-driver-ahead", weight: 8 }
                : { className: "axm-path-ahead", weight: 5, dashArray: "2 8" }
            }
          />
        </>
      )}

      {/* Officers (shown in Control Room mode) */}
      {!isDriver &&
        officers.map((o) => (
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

      {/* Junctions */}
      {junctions.map((j) => {
        const isAiims = j.id === "aiims";

        if (isDriver) {
          if (isAiims) {
            return (
              <Marker
                key={j.id}
                position={[j.lat, j.lng]}
                icon={L.divIcon({
                  className: "",
                  html: `
                    <div class="axm-driver-hospital-pin">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width: 14px; height: 14px;">
                        <path d="M12 2v20M2 12h20"/>
                      </svg>
                      <span>AIIMS HOSPITAL</span>
                    </div>
                  `,
                  iconSize: [140, 32],
                  iconAnchor: [70, 16],
                })}
              />
            );
          }

          return (
            <Marker
              key={`${j.id}-${j.status}`}
              position={[j.lat, j.lng]}
              icon={L.divIcon({
                className: "",
                html: `
                  <div class="axm-driver-pill">
                    <span class="axm-driver-pill-dot axm-driver-pill-dot--${j.status.toLowerCase()}"></span>
                    <span>${j.name}</span>
                  </div>
                `,
                iconSize: [110, 26],
                iconAnchor: [55, 13],
              })}
            />
          );
        }

        // Control Room view junctions
        const statusKey = j.status in ICONS ? j.status : "CLEAR";
        const cls = `axm-junction axm-junction--${j.status.toLowerCase()} ${
          selectedJunctionId === j.id ? "axm-junction--selected" : ""
        }`;
        return (
          <Marker
            key={`${j.id}-${j.status}-${selectedJunctionId === j.id}`}
            position={[j.lat, j.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div class="${cls}" role="img" aria-label="${j.name}: ${j.status}">${svg(ICONS[statusKey], 3)}</div>`,
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

      {/* Ambulance Marker */}
      {ambulance && (
        <Marker
          position={[ambulance.lat, ambulance.lng]}
          zIndexOffset={1000}
          icon={
            isDriver
              ? L.divIcon({
                  className: "",
                  html: `
                    <div class="axm-driver-marker-wrap">
                      <div class="axm-driver-pulse"></div>
                      <div class="axm-driver-arrow" style="transform: rotate(${ambulance.heading ?? 0}deg); transition: transform 0.2s ease;">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 20px; height: 20px;">
                          <path d="M12 2L19 21L12 17L5 21L12 2Z" />
                        </svg>
                      </div>
                    </div>
                  `,
                  iconSize: [44, 44],
                  iconAnchor: [22, 22],
                })
              : L.divIcon({
                  className: "",
                  html: `<div class="axm-ambulance" style="transform: rotate(${ambulance.heading ?? 0}deg); transition: transform 0.2s ease;" role="img" aria-label="Ambulance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg></div>`,
                  iconSize: [30, 30],
                  iconAnchor: [15, 15],
                })
          }
        />
      )}
    </MapContainer>
  );
}
