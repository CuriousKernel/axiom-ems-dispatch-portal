/**
 * src/lib/route-data.ts
 *
 * Loads the primary route from static JSON and exports a cached PreparedRoute.
 * Also exposes `routeIsSynthetic` — true when the saved file is a straight-line
 * placeholder that hasn't been replaced with the real OSRM road route yet.
 *
 * A route is "synthetic" when it has fewer than 50 coordinate points (the OSRM
 * real route has 566 points; a straight-line fallback would have only 2–6).
 */

import primaryRouteGeoJson from "../data/route-primary.json";
import altRouteGeoJson from "../data/route-alt.json";
import { prepareRoute, type PreparedRoute } from "./route";
import { JUNCTIONS } from "./axiom/seed";

// GeoJSON coordinates are [lng, lat]; convert to { lat, lng }
const rawCoords = (primaryRouteGeoJson.geometry.coordinates as [number, number][]).map(
  ([lng, lat]) => ({ lat, lng }),
);

const rawAltCoords = (altRouteGeoJson.geometry.coordinates as [number, number][]).map(
  ([lng, lat]) => ({ lat, lng }),
);

/**
 * True when the JSON file is a straight-line placeholder (< 50 coordinate points).
 * Run `npm run fetch-route` to replace it with the real OSRM road geometry.
 */
export const routeIsSynthetic: boolean = rawCoords.length < 50;

/**
 * The static resampled route for the primary Connaught Place -> AIIMS corridor.
 */
export const PRIMARY_ROUTE: PreparedRoute = prepareRoute(rawCoords, JUNCTIONS, 10);

/**
 * The static resampled route for the alternate corridor (diverts around ITO via Ring Road).
 */
export const ALT_ROUTE: PreparedRoute = prepareRoute(rawAltCoords, JUNCTIONS, 10);

