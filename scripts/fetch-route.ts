/**
 * scripts/fetch-route.ts
 *
 * Script to fetch the real road routes from OSRM driving service:
 * 1. Primary: Connaught Place -> Mandi House -> ITO -> Pragati Maidan -> Ashram -> AIIMS
 *    Outputs to src/data/route-primary.json
 * 2. Alternate: Connaught Place -> Mandi House -> Ring Road / IP Estate (bypasses ITO) -> Pragati Maidan -> Ashram -> AIIMS
 *    Outputs to src/data/route-alt.json
 */

import fs from "node:fs";
import path from "node:path";

interface LatLng {
  lat: number;
  lng: number;
}

const JUNCTIONS_PRIMARY = [
  { id: "cp", name: "Connaught Place", lat: 28.6315, lng: 77.2167 },
  { id: "mandi", name: "Mandi House", lat: 28.6258, lng: 77.2341 },
  { id: "ito", name: "ITO", lat: 28.6289, lng: 77.241 },
  { id: "pragati", name: "Pragati Maidan", lat: 28.6183, lng: 77.2453 },
  { id: "ashram", name: "Ashram Chowk", lat: 28.5713, lng: 77.2588 },
  { id: "aiims", name: "AIIMS", lat: 28.5672, lng: 77.21 },
];

const JUNCTIONS_ALT = [
  { id: "cp", name: "Connaught Place", lat: 28.6315, lng: 77.2167 },
  { id: "mandi", name: "Mandi House", lat: 28.6258, lng: 77.2341 },
  { id: "ring_road_bypass", name: "Ring Road Bypass", lat: 28.6220, lng: 77.2510 },
  { id: "pragati", name: "Pragati Maidan", lat: 28.6183, lng: 77.2453 },
  { id: "ashram", name: "Ashram Chowk", lat: 28.5713, lng: 77.2588 },
  { id: "aiims", name: "AIIMS", lat: 28.5672, lng: 77.21 },
];

function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const sq =
    sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * 6371000 * Math.asin(Math.sqrt(sq));
}

async function fetchAndSaveRoute(
  waypoints: { id: string; name: string; lat: number; lng: number }[],
  outFileName: string,
) {
  const coordsParam = waypoints.map((j) => `${j.lng},${j.lat}`).join(";");
  const url = `http://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  console.log(`Fetching route: ${outFileName} from OSRM: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM fetch failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.code !== "Ok" || !json.routes?.[0]) {
    throw new Error(`OSRM returned error: ${JSON.stringify(json)}`);
  }

  const route = json.routes[0];
  const coordinates: [number, number][] = route.geometry.coordinates; // [lng, lat]
  console.log(`Received ${outFileName}: ${coordinates.length} points, distance ${route.distance}m`);

  const junctionPoints = waypoints.map((j) => {
    let nearestIdx = 0;
    let minDist = Infinity;
    coordinates.forEach(([lng, lat], idx) => {
      const d = haversineMetres({ lat, lng }, j);
      if (d < minDist) {
        minDist = d;
        nearestIdx = idx;
      }
    });

    return {
      id: j.id,
      name: j.name,
      lat: j.lat,
      lng: j.lng,
      nearestIndex: nearestIdx,
      distanceFromJunctionMeters: minDist,
    };
  });

  const output = {
    type: "Feature",
    properties: {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      waypoints: waypoints.map((j) => j.name),
      junctions: junctionPoints,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };

  const outputPath = path.resolve(process.cwd(), "src/data", outFileName);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Saved ${outFileName} (${(route.distance / 1000).toFixed(2)} km) to ${outputPath}`);
}

async function main() {
  await fetchAndSaveRoute(JUNCTIONS_PRIMARY, "route-primary.json");
  await fetchAndSaveRoute(JUNCTIONS_ALT, "route-alt.json");
}

main().catch((err) => {
  console.error("Failed to fetch routes:", err);
  process.exit(1);
});
