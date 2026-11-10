// Checks on a delivered labels.geojson that need only the file; self-crossings and the area of interest use turf in checker.js.
import { LABEL_PROPERTIES, ringArea } from "./boxes-tools.js";

export const TARGET_OBJECTS = 1000;
export const SPREAD_TILES = 1000;
export const MINIMUM_SPREAD_TILES = 500;
export const NO_TYPE = "(none)";
const POSITION_DEPTH = { LineString: 1, Polygon: 2, MultiLineString: 2, MultiPolygon: 3 };
const LISTED_FEATURE_LIMIT = 5;

export function parseLabels(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`The file isn't valid JSON: ${error.message}`);
  }
}

// Feature numbers start at 1, as a person counts them in the file.
export function featureList(numbers) {
  const shown = numbers.slice(0, LISTED_FEATURE_LIMIT).join(", ");
  return numbers.length > LISTED_FEATURE_LIMIT ? `${shown} and ${numbers.length - LISTED_FEATURE_LIMIT} more` : shown;
}

function failingFeatureNumbers(features, isBad) {
  return features.flatMap((feature, index) => (isBad(feature) ? [index + 1] : []));
}

function checkResult(title, bad, problem) {
  return bad.length === 0 ? { title, ok: true, detail: "", bad } : { title, ok: false, detail: `${problem}: feature ${featureList(bad)}.`, bad };
}

export function collectionCheck(geojson) {
  const title = "A GeoJSON FeatureCollection with features";
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return { title, ok: false, detail: `The file's type is ${JSON.stringify(geojson?.type)}; it needs "FeatureCollection" and a features list.` };
  }
  return geojson.features.length > 0 ? { title, ok: true, detail: "" } : { title, ok: false, detail: "The features list is empty." };
}

export function imageryUrlCheck(geojson) {
  const title = "imagery_url at the top of the file";
  const url = geojson.imagery_url;
  if (typeof url !== "string" || url === "") return { title, ok: false, detail: "imagery_url is missing next to \"type\" and \"features\"." };
  if (!url.startsWith("https://")) return { title, ok: false, detail: "imagery_url needs to start with https://." };
  const missing = ["{z}", "{x}", "{y}"].filter((part) => !url.includes(part));
  return missing.length === 0 ? { title, ok: true, detail: "" } : { title, ok: false, detail: `imagery_url is missing ${missing.join(", ")}.` };
}

function positions(geometry) {
  return [geometry.coordinates].flat(POSITION_DEPTH[geometry.type]);
}

const isPosition = (position) => Array.isArray(position) && position.length >= 2 && position.every(Number.isFinite);

// A polygon or line whose coordinates nest at the depth its type asks for; the other checks read only these.
export function isWellFormed(feature) {
  const geometry = feature.geometry;
  return geometry?.type in POSITION_DEPTH && Array.isArray(geometry.coordinates) && positions(geometry).every(isPosition);
}

export function shapeCheck(geojson) {
  return checkResult("Boxes, outlines or lines", failingFeatureNumbers(geojson.features, (feature) => !isWellFormed(feature)), "Points, empty or badly nested geometry");
}

function outsideLonLat([longitude, latitude]) {
  return !(Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90);
}

export function lonLatCheck(geojson) {
  const title = "Longitude and latitude, EPSG:4326";
  const name = geojson.crs?.properties?.name;
  if (name && !/(CRS84|EPSG::?4326)$/.test(name)) return { title, ok: false, detail: `The file declares ${name}; save it in EPSG:4326.` };
  const bad = failingFeatureNumbers(geojson.features, (feature) => isWellFormed(feature) && positions(feature.geometry).some(outsideLonLat));
  return checkResult(title, bad, "Coordinates outside longitude and latitude");
}

// Only these features reach the map and the measures: a projected file would place them far outside the world.
export function isMappable(feature) {
  return isWellFormed(feature) && !positions(feature.geometry).some(outsideLonLat);
}

export function objectNameCheck(geojson) {
  const named = (feature) => typeof feature.properties?.object_name === "string" && feature.properties.object_name.trim() !== "";
  return checkResult("object_name on every feature", failingFeatureNumbers(geojson.features, (feature) => !named(feature)), "object_name is missing");
}

function ringProblem(ring) {
  if (ring.length < 4) return true;
  const [first, last] = [ring[0], ring.at(-1)];
  return first[0] !== last[0] || first[1] !== last[1] || ringArea(ring) === 0;
}

// A line with every position on one point has no length.
function lineProblem(line) {
  return line.length < 2 || line.every(([x, y]) => x === line[0][0] && y === line[0][1]);
}

// A ring needs four positions with the last equal to the first, and a line two positions (RFC 7946, sections 3.1.4 and 3.1.6).
export function hasBrokenShape(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates.some(ringProblem);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat().some(ringProblem);
  if (geometry.type === "LineString") return lineProblem(geometry.coordinates);
  return geometry.coordinates.some(lineProblem);
}

export function closedShapeCheck(geojson) {
  const bad = failingFeatureNumbers(geojson.features, (feature) => isWellFormed(feature) && hasBrokenShape(feature.geometry));
  return checkResult("Closed outlines and lines with a length", bad, "Lacks an area or a length");
}

export function duplicateCheck(geojson) {
  const seen = new Set();
  const bad = failingFeatureNumbers(geojson.features, (feature) => {
    if (!feature.geometry) return false;
    const key = JSON.stringify(feature.geometry);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  return checkResult("One feature per object, each shape once", bad, "The same shape twice");
}

// Properties that the auto labeller writes for its own use; any other property can hold the object's type.
export function typeKeys(geojson) {
  const keys = new Set(geojson.features.flatMap((feature) => Object.keys(feature.properties ?? {})));
  return [...keys].filter((key) => !LABEL_PROPERTIES.includes(key)).sort();
}

function typeLabel(feature, typeKey) {
  const value = typeKey ? feature.properties?.[typeKey] : feature.properties?.object_name;
  return value === undefined || value === null || value === "" ? NO_TYPE : String(value);
}

export function typeCounts(geojson, typeKey) {
  const counts = new Map();
  for (const feature of geojson.features) {
    const label = typeLabel(feature, typeKey);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const isLine = (feature) => ["LineString", "MultiLineString"].includes(feature.geometry?.type);

// A file holds lines when every feature with a usable shape is a line, as roads and drains from the HOT Export Tool.
export function holdsLines(geojson) {
  const shaped = geojson.features.filter(isWellFormed);
  return shaped.length > 0 && shaped.every(isLine);
}

// The auto labeller names each label's tile as zoom-x-y, which gives the project zoom.
export function zoomFromTileIds(geojson) {
  const tileId = geojson.features.map((feature) => feature.properties?.tile_id).find((value) => /^\d+-\d+-\d+$/.test(value ?? ""));
  return tileId ? Number(tileId.split("-")[0]) : null;
}

// The measures are passed in so the table runs without turf and tile-cover: lineKilometres(feature) and featureTiles(feature), a list of tile keys.
export function typeTable(geojson, typeKey, { lineKilometres, featureTiles }) {
  const total = geojson.features.length;
  const kilometres = new Map();
  const tiles = new Map();
  for (const feature of geojson.features.filter(isMappable)) {
    const label = typeLabel(feature, typeKey);
    if (isLine(feature)) kilometres.set(label, (kilometres.get(label) ?? 0) + lineKilometres(feature));
    if (!tiles.has(label)) tiles.set(label, new Set());
    for (const key of featureTiles(feature)) tiles.get(label).add(key);
  }
  return typeCounts(geojson, typeKey).map(([label, count]) => ({
    label,
    count,
    share: (count / total) * 100,
    kilometres: kilometres.get(label) ?? 0,
    tiles: tiles.get(label)?.size ?? 0,
  }));
}

// Labels without a type value count toward no type, so they can't reach the target.
export function topType(counts) {
  return counts.find(([name]) => name !== NO_TYPE) ?? ["", 0];
}

export function targetCheck(counts) {
  const [label, count] = topType(counts);
  const title = `At least ${TARGET_OBJECTS.toLocaleString("en")} of the most common type`;
  if (count >= TARGET_OBJECTS) return { title, ok: true, detail: `${label}: ${count.toLocaleString("en")}.` };
  return { title, ok: false, detail: label ? `The most common, ${label}, has ${count.toLocaleString("en")}.` : "Every label lacks a type value." };
}

export function topLineRow(rows) {
  return rows.filter((row) => row.label !== NO_TYPE).sort((a, b) => b.tiles - a.tiles)[0] ?? null;
}

// Lines are counted by the tiles they touch at the project zoom, one training image each; the type with the most tiles counts.
export function lineTargetCheck(rows, zoom) {
  const title = `At least ${TARGET_OBJECTS.toLocaleString("en")} tiles of one type`;
  if (zoom === null) return { title, ok: false, detail: "Choose the project zoom to count the tiles the lines touch." };
  const top = topLineRow(rows);
  if (!top) return { title, ok: false, detail: "Every label lacks a type value." };
  const summary = `${top.label}: ${top.tiles.toLocaleString("en")} tiles at zoom ${zoom} (${top.kilometres.toFixed(1)} km).`;
  return { title, ok: top.tiles >= TARGET_OBJECTS, detail: summary };
}

// Each tile is one training image: below the minimum the delivery isn't accepted, and between the minimum and the target it is accepted with a warning.
export function spreadCheck(rows, zoom) {
  const title = `Spread over at least ${SPREAD_TILES.toLocaleString("en")} tiles`;
  if (zoom === null) return { title, ok: false, warning: true, detail: "Choose the project zoom to count the tiles the labels touch." };
  const top = rows.find((row) => row.label !== NO_TYPE);
  if (!top) return { title, ok: false, detail: "Every label lacks a type value." };
  const detail = `${top.label}: ${top.tiles.toLocaleString("en")} tiles at zoom ${zoom}.`;
  if (top.tiles >= SPREAD_TILES) return { title, ok: true, detail };
  if (top.tiles >= MINIMUM_SPREAD_TILES) return { title, ok: false, warning: true, detail: `${detail} Accepted; more tiles give the model more training images.` };
  return { title, ok: false, detail: `${detail} Below ${MINIMUM_SPREAD_TILES} tiles isn't accepted; label a larger area.` };
}

// The checks on the file itself; each one after the first reads a FeatureCollection.
export function fileChecks(geojson) {
  const collection = collectionCheck(geojson);
  if (!collection.ok) return [collection];
  return [collection, imageryUrlCheck(geojson), lonLatCheck(geojson), shapeCheck(geojson), objectNameCheck(geojson), closedShapeCheck(geojson), duplicateCheck(geojson)];
}
