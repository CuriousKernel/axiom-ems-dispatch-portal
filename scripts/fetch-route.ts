/**
 * scripts/fetch-route.ts
 *
 * One-off script to fetch the real road route from OSRM driving service.
 * Waypoints: Connaught Place -> Mandi House -> ITO -> Pragati Maidan -> Ashram -> AIIMS
 * Outputs to src/data/route-primary.json
 */

import fs from "node:fs";
import path from "node:path";

interface LatLng {
  lat: number;
  lng: number;
}

const JUNCTIONS = [
  { id: "cp", name: "Connaught Place", lat: 28.6315, lng: 77.2167 },
  { id: "mandi", name: "Mandi House", lat: 28.6258, lng: 77.2341 },
  { id: "ito", name: "ITO", lat: 28.6289, lng: 77.241 },
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

async function main() {
  const coordsParam = JUNCTIONS.map((j) => `${j.lng},${j.lat}`).join(";");
  const url = `http://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  console.log(`Fetching route from OSRM: ${url}`);
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
  console.log(`Received route with ${coordinates.length} points, distance ${route.distance}m`);

  // Map each junction to the nearest point in the coordinates list
  const junctionPoints = JUNCTIONS.map((j) => {
    let nearestIdx = 0;
    let minDist = Infinity;
    coordinates.forEach(([lng, lat], idx) => {
      const d = haversineMetres({ lat, lng }, j);
      if (d < minDist) {
        minDist = d;
        nearestIdx = idx;
      }
    });

    console.log(`Junction ${j.name} (${j.id}) mapped to coordinate index ${nearestIdx} (${minDist.toFixed(1)}m away)`);
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
      waypoints: JUNCTIONS.map((j) => j.name),
      junctions: junctionPoints,
    },
    geometry: {
      type: "LineString",
      coordinates, // [lng, lat][]
    },
  };

  const outputPath = path.resolve(process.cwd(), "src/data/route-primary.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Saved route to ${outputPath}`);
}

main().catch((err) => {
  console.error("Failed to fetch route:", err);
  process.exit(1);
});
