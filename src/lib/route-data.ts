/**
 * src/lib/route-data.ts
 *
 * Loads the primary route from static JSON and exports a cached PreparedRoute.
 * Works seamlessly in both browser and test environments without network access.
 */

import primaryRouteGeoJson from "../data/route-primary.json";
import { prepareRoute, type PreparedRoute } from "./route";
import { JUNCTIONS } from "./axiom/seed";

// GeoJSON coordinates are [lng, lat]; convert to { lat, lng }
const rawCoords = (primaryRouteGeoJson.geometry.coordinates as [number, number][]).map(
  ([lng, lat]) => ({ lat, lng }),
);

/**
 * The static resampled route for the primary Connaught Place -> AIIMS corridor.
 */
export const PRIMARY_ROUTE: PreparedRoute = prepareRoute(rawCoords, JUNCTIONS, 10);
