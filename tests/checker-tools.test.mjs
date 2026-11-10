import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { closedShapeCheck, collectionCheck, duplicateCheck, featureList, fileChecks, hasBrokenShape, imageryUrlCheck, isLine, isMappable, isWellFormed, lonLatCheck, objectNameCheck, parseLabels, shapeCheck, labelledTiles, spreadCheck, holdsLines, lineTargetCheck, targetCheck, topType, typeCounts, typeKeys, typeTable, zoomFromTileIds } from "../docs/builder/checker-tools.js";

const TILE_URL = "https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/69075f1de47603686de24fe8/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0";
const square = (x, y, size = 0.0001) => ({ type: "Polygon", coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] });
const feature = (geometry, properties = { object_name: "solar panel" }) => ({ type: "Feature", geometry, properties });
const labels = (features, extra = { imagery_url: TILE_URL }) => ({ type: "FeatureCollection", ...extra, features });

test("invalid JSON is reported with the parser's reason", () => {
  assert.throws(() => parseLabels("{\"type\": "), /The file isn't valid JSON/);
  assert.deepEqual(parseLabels("{\"type\":\"FeatureCollection\"}"), { type: "FeatureCollection" });
});

test("a feature list names the first five and counts the rest", () => {
  assert.equal(featureList([1, 2]), "1, 2");
  assert.equal(featureList([1, 2, 3, 4, 5, 6, 7]), "1, 2, 3, 4, 5 and 2 more");
});

test("only a FeatureCollection with features passes, and the other checks wait for one", () => {
  assert.equal(collectionCheck(labels([feature(square(0, 0))])).ok, true);
  assert.equal(collectionCheck(labels([])).detail, "The features list is empty.");
  assert.match(collectionCheck({ type: "Feature" }).detail, /"Feature"/);
  assert.equal(fileChecks({ type: "Feature" }).length, 1);
});

test("imagery_url must be an https tile URL with z, x and y", () => {
  assert.equal(imageryUrlCheck(labels([])).ok, true);
  assert.match(imageryUrlCheck(labels([], {})).detail, /missing/);
  assert.match(imageryUrlCheck(labels([], { imagery_url: TILE_URL.replace("https", "http") })).detail, /https/);
  assert.equal(imageryUrlCheck(labels([], { imagery_url: TILE_URL.replace("{y}", "1") })).detail, "imagery_url is missing {y}.");
});

test("coordinates beyond longitude and latitude, or a projected CRS, fail", () => {
  assert.equal(lonLatCheck(labels([feature(square(-13.19, 8.46))])).ok, true);
  const projected = feature({ type: "Polygon", coordinates: [[[-1468000, 945000], [-1467990, 945000], [-1467990, 945010], [-1468000, 945000]]] });
  assert.equal(lonLatCheck(labels([feature(square(0, 0)), projected])).detail, "Coordinates outside longitude and latitude: feature 2.");
  const road = feature({ type: "MultiLineString", coordinates: [[[18.83, -33.92], [18.84, -33.92]], [[18.83, -33.92], [200, -33.92]]] });
  assert.equal(lonLatCheck(labels([road])).ok, false);
  assert.match(lonLatCheck(labels([], { crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32628" } } })).detail, /32628/);
  assert.equal(lonLatCheck(labels([feature(square(0, 0))], { crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } } })).ok, true);
  assert.equal(lonLatCheck(labels([feature(square(0, 0))], { crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } } })).ok, true);
  const parts = feature({ type: "MultiPolygon", coordinates: [square(0, 0).coordinates, square(200, 0).coordinates] });
  assert.equal(lonLatCheck(labels([parts])).ok, false);
});

test("points and empty geometry fail the shape check, lines pass", () => {
  const line = feature({ type: "LineString", coordinates: [[0, 0], [0.001, 0]] });
  assert.equal(shapeCheck(labels([feature(square(0, 0)), line])).ok, true);
  assert.equal(shapeCheck(labels([line, feature({ type: "Point", coordinates: [0, 0] }), feature(null)])).detail, "Points, empty or badly nested geometry: feature 2, 3.");
});

test("a polygon nested one level too shallow fails the shape check and the other checks pass over it", () => {
  const shallow = feature({ type: "Polygon", coordinates: square(0, 0).coordinates[0] });
  assert.equal(isWellFormed(shallow), false);
  assert.equal(isWellFormed(feature(square(0, 0))), true);
  const geojson = labels([feature(square(0, 0)), shallow]);
  assert.equal(shapeCheck(geojson).detail, "Points, empty or badly nested geometry: feature 2.");
  assert.equal(lonLatCheck(geojson).ok, true);
  assert.equal(closedShapeCheck(geojson).ok, true);
});

test("object_name must be a non-empty text on every feature", () => {
  assert.equal(objectNameCheck(labels([feature(square(0, 0))])).ok, true);
  assert.equal(objectNameCheck(labels([feature(square(0, 0), {}), feature(square(1, 1), { object_name: " " }), feature(square(2, 2))])).detail, "object_name is missing: feature 1, 2.");
});

test("open, short and flat rings are broken, a closed square is not", () => {
  assert.equal(hasBrokenShape(square(0, 0)), false);
  assert.equal(hasBrokenShape({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }), true);
  assert.equal(hasBrokenShape({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 0]]] }), true);
  assert.equal(hasBrokenShape({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] }), true);
  assert.equal(hasBrokenShape({ type: "MultiPolygon", coordinates: [square(0, 0).coordinates, [[[0, 0], [1, 0], [0, 0]]]] }), true);
  assert.equal(hasBrokenShape({ type: "LineString", coordinates: [[0, 0]] }), true);
  assert.equal(hasBrokenShape({ type: "MultiLineString", coordinates: [[[0, 0], [1, 0]], [[0, 0]]] }), true);
  assert.equal(hasBrokenShape({ type: "LineString", coordinates: [[0, 0], [0.001, 0]] }), false);
  assert.equal(hasBrokenShape({ type: "LineString", coordinates: [[0, 0], [0, 0], [1, 0]] }), false);
  assert.equal(closedShapeCheck(labels([feature(square(0, 0)), feature({ type: "Point", coordinates: [0, 0] })])).ok, true);
});

test("the same geometry twice is a copy", () => {
  assert.equal(duplicateCheck(labels([feature(square(0, 0)), feature(square(1, 1))])).ok, true);
  assert.equal(duplicateCheck(labels([feature(square(0, 0)), feature(square(1, 1)), feature(square(0, 0))])).detail, "The same shape twice: feature 3.");
  assert.equal(duplicateCheck(labels([feature(null), feature(null)])).ok, true);
});

test("type keys leave out the auto labeller's own properties", () => {
  const geojson = labels([feature(square(0, 0), { object_name: "building", tile_id: "20-1-2", source: "EdgeTAM", "roof:material": "metal" })]);
  assert.deepEqual(typeKeys(geojson), ["roof:material"]);
});

test("counts group by object_name, or by the chosen type, most common first", () => {
  const geojson = labels([
    feature(square(0, 0), { object_name: "building", "roof:material": "metal" }),
    feature(square(1, 1), { object_name: "building", "roof:material": "concrete" }),
    feature(square(2, 2), { object_name: "building", "roof:material": "metal" }),
    feature(square(3, 3), { object_name: "building" }),
  ]);
  assert.deepEqual(typeCounts(geojson, null), [["building", 4]]);
  assert.deepEqual(typeCounts(geojson, "roof:material"), [["metal", 2], ["(none)", 1], ["concrete", 1]]);
});

test("the target passes at 1,000 of the most common type and fails at 999", () => {
  assert.equal(targetCheck([["metal", 1000], ["concrete", 3]]).ok, true);
  assert.equal(targetCheck([["metal", 999]]).detail, "The most common, metal, has 999.");
  assert.equal(targetCheck([]).ok, false);
  assert.deepEqual(topType([["(none)", 5], ["metal", 3]]), ["metal", 3]);
  assert.deepEqual(topType([["(none)", 5]]), ["", 0]);
});

test("labels without a type value can't reach the target", () => {
  const untyped = labels(Array.from({ length: 1000 }, (_, index) => feature(square(index * 0.001, 0), { object_name: "building" })));
  const check = targetCheck(typeCounts(untyped, "roof:material"));
  assert.equal(check.ok, false);
  assert.equal(check.detail, "Every label lacks a type value.");
});

test("the Stellenbosch example passes every file check and reaches the target with metal roofs", () => {
  const example = parseLabels(readFileSync(new URL("../docs/examples/files/stellenbosch-roofs-labels.geojson", import.meta.url), "utf8"));
  assert.deepEqual(fileChecks(example).map((check) => check.ok), [true, true, true, true, true, true, true]);
  assert.deepEqual(typeCounts(example, null), [["building", 1056]]);
  assert.deepEqual(typeCounts(example, "roof:material")[0], ["metal", 1036]);
  assert.equal(targetCheck(typeCounts(example, "roof:material")).ok, true);
});

test("a road line with every position on one point has no length and fails", () => {
  const road = (coordinates) => feature({ type: "LineString", coordinates }, { object_name: "road", surface: "asphalt" });
  const check = closedShapeCheck(labels([road([[18.8388, -33.92], [18.8389, -33.9199]]), road([[18.8393, -33.92], [18.8393, -33.92], [18.8393, -33.92]])]));
  assert.equal(check.detail, "Lacks an area or a length: feature 2.");
  assert.equal(hasBrokenShape({ type: "MultiLineString", coordinates: [[[0, 0], [1, 0]], [[2, 2], [2, 2]]] }), true);
});

test("the type table gives each type's labels, share, kilometres of line and distinct tiles", () => {
  const road = (surface, coordinates) => feature({ type: "LineString", coordinates }, { object_name: "road", surface });
  const geojson = labels([
    road("asphalt", [[0, 0], [1, 0]]),
    road("asphalt", [[0, 1], [1, 1]]),
    road("unpaved", [[0, 2], [2, 2]]),
    feature(square(5, 5), { object_name: "road" }),
  ]);
  const lineKilometres = (line) => line.geometry.coordinates.at(-1)[0] - line.geometry.coordinates[0][0];
  const featureTiles = (shape) => (shape.properties.surface === "asphalt" ? ["1/1", "1/2"] : ["9/9"]);
  assert.deepEqual(typeTable(geojson, "surface", { lineKilometres, featureTiles }), [
    { label: "asphalt", count: 2, share: 50, kilometres: 2, tiles: 2 },
    { label: "(none)", count: 1, share: 25, kilometres: 0, tiles: 1 },
    { label: "unpaved", count: 1, share: 25, kilometres: 2, tiles: 1 },
  ]);
  assert.equal(isLine(geojson.features[0]), true);
  assert.equal(isLine(geojson.features[3]), false);
});

test("a file holds lines only when every usable shape is a line", () => {
  const line = feature({ type: "LineString", coordinates: [[0, 0], [1, 0]] });
  assert.equal(holdsLines(labels([line, feature(null)])), true);
  assert.equal(holdsLines(labels([line, feature(square(0, 0))])), false);
  assert.equal(holdsLines(labels([feature(null)])), false);
});

test("the project zoom comes from the auto labeller's tile IDs", () => {
  assert.equal(zoomFromTileIds(labels([feature(square(0, 0), { object_name: "a", tile_id: "20-485884-499536" })])), 20);
  assert.equal(zoomFromTileIds(labels([feature(square(0, 0))])), null);
});

test("the line target counts tiles and fails below 1,000 tiles or without a zoom", () => {
  const rows = (tiles) => [{ label: "(none)", count: 9, share: 50, kilometres: 9, tiles: 5000 }, { label: "asphalt", count: 3, share: 50, kilometres: 12.25, tiles }];
  assert.equal(lineTargetCheck(rows(1000), 20).ok, true);
  assert.equal(lineTargetCheck(rows(1000), 20).detail, "asphalt: 1,000 tiles at zoom 20 (12.3 km).");
  const below = lineTargetCheck(rows(999), 20);
  assert.equal(below.ok, false);
  assert.equal(below.detail, "asphalt: 999 tiles at zoom 20 (12.3 km).");
  assert.match(lineTargetCheck(rows(5000), null).detail, /Choose the project zoom/);
  const ranked = lineTargetCheck([{ label: "asphalt", count: 50, share: 96, kilometres: 1, tiles: 10 }, { label: "unpaved", count: 2, share: 4, kilometres: 3, tiles: 1200 }], 18);
  assert.equal(ranked.ok, true);
  assert.match(ranked.detail, /^unpaved:/);
});

test("the spread check fails below 500 tiles, warns from 500, passes from 1,000 and warns without a zoom", () => {
  const verdict = (check) => (check.ok ? "pass" : check.warning ? "warn" : "fail");
  assert.deepEqual([499, 500, 999, 1000].map((tiles) => verdict(spreadCheck(tiles, 19))), ["fail", "warn", "warn", "pass"]);
  assert.match(spreadCheck(499, 19).detail, /^All labels: 499 tiles at zoom 19\./);
  assert.equal(verdict(spreadCheck(0, null)), "warn");
});

test("labelled tiles count each tile once across every type and leave out projected features", () => {
  const tileOf = (feature) => [feature.properties.tile];
  const collection = labels([
    feature(square(0, 0), { object_name: "building", "roof:material": "metal", tile: "1/1" }),
    feature(square(0, 0), { object_name: "building", "roof:material": "concrete", tile: "1/1" }),
    feature(square(1, 1), { object_name: "building", tile: "1/2" }),
    feature({ type: "Polygon", coordinates: [[[-1468000, 945000], [-1467990, 945000], [-1467990, 945010], [-1468000, 945000]]] }, { object_name: "building", tile: "9/9" }),
  ]);
  assert.equal(labelledTiles(collection, tileOf), 2);
});

test("a feature in projected coordinates is left out of the length and tile measures", () => {
  const projected = feature({ type: "LineString", coordinates: [[500000, 945000], [500100, 945000]] }, { object_name: "road" });
  const measured = [];
  const record = (shape) => { measured.push(shape); return []; };
  const [row] = typeTable(labels([projected]), null, { lineKilometres: (shape) => record(shape).length + 5, featureTiles: record });
  assert.deepEqual(measured, []);
  assert.equal(row.kilometres, 0);
  assert.equal(row.count, 1);
});

test("a feature is mappable only when well formed and within longitude and latitude", () => {
  assert.equal(isMappable(feature(square(0, 0))), true);
  assert.equal(isMappable(feature({ type: "LineString", coordinates: [[500000, 945000], [500100, 945000]] })), false);
  assert.equal(isMappable(feature(null)), false);
});
