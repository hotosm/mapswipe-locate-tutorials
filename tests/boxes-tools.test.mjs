import assert from "node:assert/strict";
import { test } from "node:test";

import { LABEL_PROPERTIES, MAX_AREA_TILES, areaObjectsKey, areaTiles, attributeValues, boxOutline, cellRectangle, clampedCorners, datasetCounts, detailTiles, detailImage, dragBox, isDrag, isOutsideImage, keepsCutLabel, keepsDrawnShape, keptTiles, keyAction, projectTiles, withSavedTiles, tilesFileViewed, tilesGeojson, ringArea, ringOnTiles, fileSettings, placedLabels, labelSettings, legacyKeys, mergedSaves, labelsGeojson, tileGrid, largestRing, lonLatToPixel, markedAreaEdges, maskBox, mergedSelection, objectsWithoutValue, setStep, agreementEdges, parseTileTemplate, polygonRings, remembered, rectangleFromSide, restoredObjects, rotatedBox, sameLabel, savedObjectsKey, targetProgress, valueCounts, valueForKey, valueSummary } from "../docs/builder/boxes-tools.js";

const URL_TEMPLATE = "https://tiles.example/cog/tiles/WebMercatorQuad/20/485848/499534@1x?url=a.tif";
const row = (task, x, cell, kept) => ({
  task_id: task, task_partition_index: cell, tile_x: x, tile_y: 499534, tile_z: 20,
  url: URL_TEMPLATE.replace("485848", String(x)), "0_count": kept ? 0 : 3, "1_count": kept ? 3 : 0, total_count: 3,
});
const grid = (task, x, keptCells) => Array.from({ length: 16 }, (_, cell) => row(task, x, cell, keptCells.includes(cell)));

test("only tiles with a kept cell are listed, each with its kept cells in order", () => {
  const tiles = keptTiles([...grid("20-485848-499534", 485848, [9, 2]), ...grid("20-485849-499534", 485849, [])], 50);
  assert.equal(tiles.length, 1);
  assert.deepEqual(tiles[0].cells, [2, 9]);
  assert.equal(tiles[0].size, 4);
  assert.equal(tiles[0].template, "https://tiles.example/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=a.tif");
});

test("with all mapped tiles, a tile nobody marked is listed without cells after the marked tiles, and a tile nobody mapped is left out", () => {
  const unmapped = grid("20-485850-499534", 485850, []).map((cell) => ({ ...cell, "0_count": 0, total_count: 0 }));
  const tiles = keptTiles([...grid("20-485849-499534", 485849, []), ...grid("20-485848-499534", 485848, [9, 2]), ...unmapped], 50, { allMapped: true });
  assert.deepEqual(tiles.map((tile) => [tile.id, tile.cells]), [["20-485848-499534", [2, 9]], ["20-485849-499534", []]]);
});

test("a tile URL needs https and {z}, {x} and {y}", () => {
  assert.equal(parseTileTemplate(" https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=a.tif "), "https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=a.tif");
  assert.throws(() => parseTileTemplate("https://tiles.example/{z}/{x}.png"), /\{z\}, \{x\} and \{y\}/);
  assert.throws(() => parseTileTemplate("tiles.example/{z}/{x}/{y}.png"), /https:\/\//);
  assert.throws(() => parseTileTemplate("http://tiles.example/{z}/{x}/{y}.png"), /https:\/\//);
});

const square = (west, south, size) => [[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]];
const AREA = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [square(-13.19, 8.46, 0.001)] } },
    { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: [[square(-13.18, 8.46, 0.001)]] } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [-13.19, 8.46] } },
  ],
};

test("the area's tiles come from every polygon at the chosen zoom, once each, row by row, named zoom-x-y", () => {
  const calls = [];
  const cover = (geometry, options) => {
    calls.push({ geometry, options });
    return calls.length === 1 ? [[5, 3], [4, 3], [5, 2]] : [[5, 3], [9, 2]];
  };
  const tiles = areaTiles(AREA, 20, "https://tiles.example/{z}/{x}/{y}", cover);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { geometry: { type: "Polygon", coordinates: [square(-13.19, 8.46, 0.001)] }, options: { min_zoom: 20, max_zoom: 20 } });
  assert.deepEqual(tiles.map((tile) => tile.id), ["20-5-2", "20-9-2", "20-4-3", "20-5-3"]);
  assert.deepEqual(tiles[0], { id: "20-5-2", x: 5, y: 2, zoom: 20, template: "https://tiles.example/{z}/{x}/{y}", size: 1, cells: [] });
});

test("an area without polygons, or with more tiles than the limit, is refused with a message", () => {
  const point = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } };
  assert.throws(() => areaTiles(point, 20, "https://tiles.example/{z}/{x}/{y}", () => []), /doesn't hold any polygons/);
  const many = () => Array.from({ length: MAX_AREA_TILES + 1 }, (_, index) => [index, 0]);
  assert.throws(() => areaTiles(AREA, 20, "https://tiles.example/{z}/{x}/{y}", many), /more than 5,000 tiles at zoom 20/);
  const atLimit = () => Array.from({ length: MAX_AREA_TILES }, (_, index) => [index, 0]);
  assert.equal(areaTiles(AREA, 20, "https://tiles.example/{z}/{x}/{y}", atLimit).length, MAX_AREA_TILES);
});

test("an area's saved labels are kept apart by tile URL, zoom and file name, and apart from any project", () => {
  const key = areaObjectsKey("https://tiles.example/{z}/{x}/{y}", 20, "area.geojson");
  assert.notEqual(key, areaObjectsKey("https://tiles.example/{z}/{x}/{y}", 21, "area.geojson"));
  assert.notEqual(key, areaObjectsKey("https://tiles.example/{z}/{x}/{y}", 20, "other.geojson"));
  assert.notEqual(key, areaObjectsKey("https://other.example/{z}/{x}/{y}", 20, "area.geojson"));
  assert.ok(key.startsWith("box-helper-objects:area:"));
});

test("an area ring of 200,000 points is counted without overflowing the stack", () => {
  const ring = Array.from({ length: 200000 }, (_, index) => [-13.19 + 0.001 * Math.cos((index / 200000) * 2 * Math.PI), 8.46 + 0.001 * Math.sin((index / 200000) * 2 * Math.PI)]);
  ring.push(ring[0]);
  const tiles = areaTiles({ type: "Polygon", coordinates: [ring] }, 20, "https://tiles.example/{z}/{x}/{y}", () => [[1, 1]]);
  assert.deepEqual(tiles.map((tile) => tile.id), ["20-1-1"]);
});

test("an area far past the limit is refused from its bounding box before any tile is covered", () => {
  const country = { type: "Polygon", coordinates: [square(80, 26, 4)] };
  assert.throws(() => areaTiles(country, 20, "https://tiles.example/{z}/{x}/{y}", () => assert.fail("cover was called")), /more than 5,000 tiles/);
});

test("a tile two zoom levels deeper is 16 sub-tiles, row by row from the top left", () => {
  const [tile] = keptTiles(grid("20-485848-499534", 485848, [0]), 50);
  const parts = detailTiles(tile, 2);
  assert.equal(parts.length, 16);
  assert.deepEqual(parts[0], { url: "https://tiles.example/cog/tiles/WebMercatorQuad/22/1943392/1998136@1x?url=a.tif", left: 0, top: 0 });
  assert.deepEqual(parts[1], { url: "https://tiles.example/cog/tiles/WebMercatorQuad/22/1943393/1998136@1x?url=a.tif", left: 256, top: 0 });
  assert.deepEqual(parts[15], { url: "https://tiles.example/cog/tiles/WebMercatorQuad/22/1943395/1998139@1x?url=a.tif", left: 768, top: 768 });
});

test("only a 404 that says the tile is outside bounds counts as beyond the image edge", () => {
  assert.equal(isOutsideImage(404, '{"detail":"Tile(x=638616, y=544184, z=20) is outside bounds"}'), true);
  assert.equal(isOutsideImage(404, '{"detail":"Not Found"}'), false);
  assert.equal(isOutsideImage(500, "outside bounds"), false);
});

test("cell 6 of a 4x4 grid is the third square of the second row", () => {
  assert.deepEqual(cellRectangle(6, 4, 1024), [512, 256, 768, 512]);
});

test("the mask box spans the set pixels inclusive of the last one, ignores pixels of other masks, and an empty mask has none", () => {
  const mask = new Uint8Array(2 * 4 * 3);
  mask[12 + 1 * 4 + 1] = 1;
  mask[12 + 2 * 4 + 2] = 1;
  mask[0] = 1;
  assert.deepEqual(maskBox(mask.subarray(12), 4, 3), [1, 1, 3, 3]);
  assert.equal(maskBox(new Uint8Array(12), 4, 3), null);
});

test("a small or straight-line movement is a click and a drag in any direction gives an ordered box kept inside the image", () => {
  assert.equal(isDrag([10, 10], [14, 13]), false);
  assert.equal(isDrag([10, 10], [40, 12]), false);
  assert.equal(isDrag([10, 10], [16, 4]), true);
  assert.deepEqual(dragBox([900, 50], [1100, -20], 1024), [900, 0, 1024, 50]);
});

test("attribute values are split at commas, trimmed, and empty or repeated values are dropped", () => {
  assert.deepEqual(attributeValues(" metal, roof_tiles,,metal , concrete "), ["metal", "roof_tiles", "concrete"]);
  assert.deepEqual(attributeValues(" , "), []);
});

test("values are counted over the listed tiles, and labels without a listed value are counted apart", () => {
  const tiles = [{ id: "a" }, { id: "b" }];
  const objects = new Map([["a", [{ value: "metal" }, { value: "metal" }, {}]], ["b", [{ value: "roof_tiles" }, { value: "slate" }]], ["gone", [{ value: "metal" }]]]);
  assert.deepEqual(valueCounts(tiles, objects, ["metal", "roof_tiles"]), [2, 1]);
  assert.equal(objectsWithoutValue(tiles, objects, ["metal", "roof_tiles"]), 2);
});

test("restored objects keep labels on unlisted tiles and reopen the saved tile, or the first tile when it is gone", () => {
  const tiles = [{ id: "20-1-1" }, { id: "20-2-1" }];
  const object = { outline: [[0, 0], [10, 0], [10, 10], [0, 0]] };
  const restored = restoredObjects({ tile: "20-2-1", objects: { "20-2-1": [object], "20-9-9": [object] } }, tiles);
  assert.deepEqual([...restored.objects], [["20-2-1", [object]], ["20-9-9", [object]]]);
  assert.equal(restored.index, 1);
  assert.equal(restoredObjects({ tile: "20-9-9", objects: {} }, tiles).index, 0);
  assert.deepEqual(restoredObjects(null, tiles), { objects: new Map(), viewed: new Set(), index: 0 });
});

test("filled setup fields win over the saved settings, and empty ones take the saved settings", () => {
  const saved = { objectName: "building", attribute: "roof:material", values: "metal, thatch" };
  assert.deepEqual(labelSettings({ objectName: "", attribute: "", values: "" }, saved), saved);
  assert.deepEqual(labelSettings({ objectName: "tree", attribute: "natural", values: "tree, tree_group" }, saved), { objectName: "tree", attribute: "natural", values: "tree, tree_group" });
  assert.deepEqual(labelSettings({ objectName: "", attribute: "natural", values: "" }, saved), { objectName: "building", attribute: "natural", values: "" });
  assert.deepEqual(labelSettings({ objectName: "", attribute: "", values: "" }, null), { objectName: "", attribute: "", values: "" });
});

test("arrow keys move between tiles, Z undoes with or without Ctrl or Cmd but not with Shift as well, D switches the tool, Esc opens the review, E edits on the map, Delete and Backspace delete the selected label, + - and 0 zoom the tile, and other keys do nothing", () => {
  assert.equal(keyAction("ArrowLeft"), "previous");
  assert.equal(keyAction("ArrowRight"), "next");
  assert.equal(keyAction("Escape"), "review");
  assert.equal(keyAction("e"), "map-edit");
  assert.equal(keyAction("Delete"), "map-delete");
  assert.equal(keyAction("Backspace"), "map-delete");
  assert.equal(keyAction("+"), "zoom-in");
  assert.equal(keyAction("-"), "zoom-out");
  assert.equal(keyAction("0"), "zoom-fit");
  assert.equal(keyAction("z"), "undo");
  assert.equal(keyAction("Z"), "undo");
  assert.equal(keyAction("z", { ctrlKey: true }), "undo");
  assert.equal(keyAction("z", { metaKey: true }), "undo");
  assert.equal(keyAction("d"), "tool");
  assert.equal(keyAction("d", { ctrlKey: true }), null);
  assert.equal(keyAction("Z", { ctrlKey: true, shiftKey: true }), null);
  assert.equal(keyAction("ArrowRight", { altKey: true }), null);
  assert.equal(keyAction("1"), null);
});

test("number keys pick the value at their place in the list, and other keys pick nothing", () => {
  const list = ["metal", "roof_tiles", "concrete"];
  assert.equal(valueForKey("1", list), "metal");
  assert.equal(valueForKey("3", list), "concrete");
  assert.equal(valueForKey("4", list), null);
  assert.equal(valueForKey("0", list), null);
  assert.equal(valueForKey("a", list), null);
  assert.equal(valueForKey("12", list), null);
});

test("objects are saved per project, whatever the share, and results without a project id fail with a message", () => {
  assert.equal(savedObjectsKey([{ project_internal_id: 3451 }]), "box-helper-objects:3451");
  assert.throws(() => savedObjectsKey([{ task_id: "20-1-1" }]), /project_internal_id/);
  assert.throws(() => savedObjectsKey([{ project_internal_id: null }]), /project_internal_id/);
});

test("the earlier per-share saves of a project are found under its key, and those of other projects are not", () => {
  const keys = ["box-helper-objects:3451:50", "box-helper-objects:3451:30:all", "box-helper-objects:34510:50", "other"];
  assert.deepEqual(legacyKeys(keys, "box-helper-objects:3451"), ["box-helper-objects:3451:50", "box-helper-objects:3451:30:all"]);
  assert.deepEqual(legacyKeys(["box-helper-objects:area:20:a.geojson:https://t/{z}/{x}/{y}"], "box-helper-objects:area:20:a.geojson:https://t/{z}/{x}/{y}"), ["box-helper-objects:area:20:a.geojson:https://t/{z}/{x}/{y}"]);
});

test("per-share saves merge into one: each tile keeps its longest list, and settings come from the save with the most labels", () => {
  const box = { outline: [[0, 0], [9, 0], [9, 9], [0, 0]] };
  const fifty = { tile: "20-1-1", objects: { "20-1-1": [box], "20-2-2": [] }, attribute: "", values: "" };
  const thirty = { tile: "20-3-3", objects: { "20-2-2": [box, box], "20-3-3": [box] }, attribute: "roof:material", values: "metal" };
  const merged = mergedSaves([fifty, thirty]);
  assert.deepEqual(merged.objects, { "20-1-1": [box], "20-2-2": [box, box], "20-3-3": [box] });
  assert.equal(merged.attribute, "roof:material");
  assert.equal(merged.tile, "20-3-3");
  assert.equal(mergedSaves([]), null);
});

test("a label counts as already there when its box overlaps an existing one by 90% of their union", () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
  assert.ok(sameLabel(square, [[0.4, 0.3], [100.2, 0.3], [100.2, 99.6], [0.4, 99.6], [0.4, 0.3]]));
  assert.ok(!sameLabel(square, [[20, 0], [120, 0], [120, 100], [20, 100], [20, 0]]));
  assert.ok(!sameLabel(square, [[200, 200], [210, 200], [210, 210], [200, 200]]));
});

test("a labels.geojson from this page gives back its object name, attribute and values; other files give no settings", () => {
  const shape = (properties) => ({ ring: [], properties: { tile_id: "20-1-1", object_name: "building", output: "rotated box", source: "EdgeTAM", ...properties } });
  assert.deepEqual(fileSettings({ type: "FeatureCollection" }, [shape({ "roof:material": "metal" }), shape({ "roof:material": "concrete" }), shape({ "roof:material": "metal" })]), { objectName: "building", attribute: "roof:material", values: "metal, concrete" });
  assert.deepEqual(fileSettings({ type: "FeatureCollection" }, [shape({})]), { objectName: "building", attribute: "", values: "" });
  assert.deepEqual(fileSettings({ type: "FeatureCollection" }, [{ ring: [], properties: { fid: 1, building: "yes" } }]), { objectName: "", attribute: "", values: "" });
});

test("the outline is the outer ring with the largest area, even when a smaller ring has more points", () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
  const speck = [[200, 200], [201, 200], [202, 200], [203, 200], [203, 201], [202, 201], [201, 201], [200, 201], [200, 200]];
  const hole = [[10, 10], [90, 10], [90, 90], [10, 90], [10, 10]];
  assert.deepEqual(largestRing([[speck], [square, hole]]), square);
  assert.deepEqual(largestRing([[square, hole], [speck]]), square);
});

test("a hand-drawn box becomes a closed four-corner outline", () => {
  assert.deepEqual(boxOutline([256, 512, 768, 1024]), [[256, 512], [768, 512], [768, 1024], [256, 1024], [256, 512]]);
});

test("in Boxes mode a hand-drawn part cut at the tile edge keeps every corner in the GeoJSON", () => {
  const piece = [[600, 300], [1024, 300], [1024, 700], [900, 800], [600, 500], [600, 300]];
  const [feature] = labelsGeojson([TILE], new Map([[TILE.id, [{ outline: piece, source: "drawn by hand" }]]]), { mode: "obb", objectName: "pothole", pixels: 1024 }).features;
  const ring = feature.geometry.coordinates[0];
  assert.equal(ring.length, 6);
  const pixels = ring.map((point) => lonLatToPixel(TILE, point, 1024).map((value) => Math.round(value)));
  assert.deepEqual(pixels.slice(0, -1).toSorted(), piece.slice(0, -1).toSorted());
});

test("a lone cell has four edges and two side by side cells share no edge", () => {
  assert.equal(markedAreaEdges([5], 4, 1024).length, 4);
  const pair = markedAreaEdges([5, 6], 4, 1024);
  assert.equal(pair.length, 6);
  assert.ok(!pair.some(([[x1], [x2]]) => x1 === 512 && x2 === 512));
});

test("cells on the grid border keep their outer edge even where the index wraps to the next row", () => {
  const edges = markedAreaEdges([3, 4], 4, 1024);
  assert.equal(edges.length, 8);
});

const TILE = { id: "20-485848-499534", x: 485848, y: 499534, zoom: 20, size: 4, cells: [0, 1], template: "https://tiles.example/{z}/{x}/{y}" };

const signedArea = (ring) => ring.slice(0, -1).reduce((sum, [x1, y1], index) => sum + x1 * ring[index + 1][1] - ring[index + 1][0] * y1, 0);

test("a box covering the whole image becomes the tile's corners in longitude and latitude, as a closed ring", () => {
  const objects = new Map([[TILE.id, [{ corners: [[0, 0], [1024, 0], [1024, 1024], [0, 1024]], source: "EdgeTAM" }]]]);
  const [feature] = labelsGeojson([TILE], objects, { mode: "obb", objectName: "tank", pixels: 1024 }).features;
  const ring = feature.geometry.coordinates[0];
  const corners = ring.map(([lon, lat]) => `${lon.toFixed(9)},${lat.toFixed(9)}`);
  assert.ok(corners.includes("-13.197326660,8.467618188"));
  assert.ok(corners.includes("-13.196983337,8.467278608"));
  assert.deepEqual(ring[0], ring.at(-1));
  assert.deepEqual(feature.properties, { tile_id: TILE.id, object_name: "tank", output: "rotated box", source: "EdgeTAM", marked_cells: 2, imagery_url: TILE.template });
});

test("with an attribute, each feature carries its own value under the attribute name", () => {
  const objects = new Map([[TILE.id, [{ corners: [[0, 0], [512, 0], [512, 512], [0, 512]], source: "EdgeTAM", value: "metal" }, { corners: [[512, 512], [1024, 512], [1024, 1024], [512, 1024]], source: "EdgeTAM", value: "roof_tiles" }]]]);
  const { features } = labelsGeojson([TILE], objects, { mode: "obb", objectName: "building", attribute: "roof:material", pixels: 1024 });
  assert.deepEqual(features.map((feature) => feature.properties["roof:material"]), ["metal", "roof_tiles"]);
  assert.equal(features[0].properties.object_name, "building");
});

test("the reserved names are the properties each feature carries without an attribute, plus image from earlier files", () => {
  const objects = new Map([[TILE.id, [{ corners: [[0, 0], [512, 0], [512, 512], [0, 512]], source: "EdgeTAM" }]]]);
  const [feature] = labelsGeojson([TILE], objects, { mode: "obb", objectName: "tank", pixels: 1024 }).features;
  assert.deepEqual([...Object.keys(feature.properties), "image"].toSorted(), LABEL_PROPERTIES.toSorted());
});

test("the labels file states the imagery URL at the top", () => {
  const objects = new Map([[TILE.id, [{ corners: [[0, 0], [512, 0], [512, 512], [0, 512]], source: "EdgeTAM" }]]]);
  assert.equal(labelsGeojson([TILE], objects, { mode: "obb", objectName: "tank", pixels: 1024 }).imagery_url, TILE.template);
});

test("boxes and outlines both come out with counterclockwise outer rings", () => {
  const clockwiseInImage = [[0, 0], [512, 0], [512, 512], [0, 0]];
  const counterclockwiseInImage = clockwiseInImage.toReversed();
  const corners = [[0, 0], [512, 0], [512, 512], [0, 512]];
  for (const [mode, object] of [["segment", { outline: clockwiseInImage }], ["segment", { outline: counterclockwiseInImage }], ["obb", { corners }], ["obb", { corners: corners.toReversed() }]]) {
    const [feature] = labelsGeojson([TILE], new Map([[TILE.id, [{ ...object, source: "EdgeTAM" }]]]), { mode, objectName: "tank", pixels: 1024 }).features;
    assert.ok(signedArea(feature.geometry.coordinates[0]) > 0, `${mode} ${JSON.stringify(object)}`);
  }
});

test("outlines use the outline points and tiles without objects add nothing", () => {
  const objects = new Map([[TILE.id, [{ outline: [[512, 256], [1024, 256], [1024, 512], [512, 256]], source: "drawn by hand" }]], ["other", []]]);
  const { features } = labelsGeojson([TILE, { ...TILE, id: "other" }], objects, { mode: "segment", objectName: "tank", pixels: 1024 });
  assert.equal(features.length, 1);
  assert.ok(features[0].geometry.coordinates[0].some((point) => Math.abs(point[0] + 13.197154998779297) < 1e-9 && Math.abs(point[1] - 8.46753329333681) < 1e-9));
  assert.equal(features[0].geometry.coordinates[0].length, 4);
  assert.equal(features[0].properties.output, "outline");
  assert.equal(features[0].properties.source, "drawn by hand");
});

const sortedPoints = (points) => points.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]).toSorted(([ax, ay], [bx, by]) => ax - bx || ay - by);

test("the rotated box of a square turned 45 degrees is the square itself, half the area of its straight box", () => {
  const diamond = [[512, 312], [712, 512], [512, 712], [312, 512], [512, 312]];
  const corners = rotatedBox(diamond);
  assert.deepEqual(sortedPoints(corners), sortedPoints(diamond.slice(0, -1)));
  const rotatedArea = Math.abs(signedArea([...corners, corners[0]])) / 2;
  assert.ok(Math.abs(400 * 400 - 2 * rotatedArea) < 1e-6);
});

test("a repeated point in the ring does not break the rotated box", () => {
  const diamond = [[512, 312], [512, 312], [712, 512], [512, 712], [312, 512], [512, 312]];
  assert.ok(rotatedBox(diamond).flat().every(Number.isFinite));
});

test("the rotated box of an upright rectangle with a point midway along a side is the rectangle", () => {
  const rectangle = [[100, 100], [200, 100], [300, 100], [300, 150], [100, 150], [100, 100]];
  assert.deepEqual(sortedPoints(rotatedBox(rectangle)), sortedPoints([[100, 100], [300, 100], [300, 150], [100, 150]]));
});

test("a rotated box cut at the image edge gets the smallest box inside the image, with square corners", () => {
  const cut = [[900, 100], [1000, 200], [1024, 176], [1024, 64], [980, 20], [900, 100]];
  const corners = rotatedBox(cut, 1024);
  assert.ok(corners.flat().every((value) => value >= 0 && value <= 1024));
  for (let index = 0; index < 4; index++) {
    const [a, b, c] = [corners[index], corners[(index + 1) % 4], corners[(index + 2) % 4]];
    assert.ok(Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 1e-6);
  }
  assert.ok(rotatedBox(cut).flat().some((value) => value > 1024));
});

test("a hand-drawn rotated box runs from the dragged side to the tapped side, on either side of it", () => {
  assert.deepEqual(rectangleFromSide([100, 100], [300, 100], [250, 160]), [[100, 100], [300, 100], [300, 160], [100, 160], [100, 100]]);
  assert.deepEqual(rectangleFromSide([100, 100], [300, 100], [250, 40]), [[100, 100], [300, 100], [300, 40], [100, 40], [100, 100]]);
});

test("rotated boxes go in the GeoJSON as their four corners", () => {
  const corners = [[512, 0], [1024, 512], [512, 1024], [0, 512]];
  const [feature] = labelsGeojson([TILE], new Map([[TILE.id, [{ corners, source: "EdgeTAM" }]]]), { mode: "obb", objectName: "tank", pixels: 1024 }).features;
  const ring = feature.geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.ok(ring.some(([lon, lat]) => Math.abs(lon + 13.197154998779297) < 1e-9 && Math.abs(lat - 8.467618188) < 1e-9));
  assert.equal(feature.properties.output, "rotated box");
});

test("a point labelled in longitude and latitude lands on the same pixel the GeoJSON export gives it", () => {
  const [feature] = labelsGeojson([TILE], new Map([[TILE.id, [{ outline: [[256, 768], [900, 768], [900, 900], [256, 768]], source: "EdgeTAM" }]]]), { mode: "segment", objectName: "tank", pixels: 1024 }).features;
  const pixels = feature.geometry.coordinates[0].map((point) => lonLatToPixel(TILE, point, 1024));
  assert.ok(pixels.some(([x, y]) => Math.abs(x - 256) < 1e-6 && Math.abs(y - 768) < 1e-6));
  assert.ok(pixels.some(([x, y]) => Math.abs(x - 900) < 1e-6 && Math.abs(y - 900) < 1e-6));
});

test("a point east and south of the tile gets pixels past the tile size", () => {
  const [x, y] = lonLatToPixel(TILE, labelsGeojson([{ ...TILE, x: TILE.x + 1, y: TILE.y + 1 }], new Map([[TILE.id, [{ outline: [[0, 0], [10, 0], [10, 10], [0, 0]], source: "EdgeTAM" }]]]), { mode: "segment", objectName: "tank", pixels: 1024 }).features[0].geometry.coordinates[0][0], 1024);
  assert.ok(Math.abs(x - 1024) < 1e-6 && Math.abs(y - 1024) < 1e-6);
});

test("loaded labels keep each polygon's outer ring, one per part of a multipolygon, and count points and lines as left out", () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const hole = [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.2]];
  const geojson = { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Polygon", coordinates: [square, hole] } },
    { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[square], [square.map(([x, y]) => [x + 5, y])]] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
    { type: "Feature", geometry: { type: "LineString", coordinates: square } },
  ] };
  const { shapes, skipped } = polygonRings(geojson);
  assert.deepEqual(shapes.map(({ ring }) => ring), [square, square, square.map(([x, y]) => [x + 5, y])]);
  assert.equal(skipped, 2);
  assert.deepEqual(polygonRings({ type: "Polygon", coordinates: [square] }), { shapes: [{ ring: square, properties: {} }], skipped: 0 });
});

test("each loaded ring keeps the properties of its feature, so an attribute value comes along", () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const geojson = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { "roof:material": "metal" }, geometry: { type: "Polygon", coordinates: [square] } },
    { type: "Feature", properties: { "roof:material": "thatch" }, geometry: { type: "MultiPolygon", coordinates: [[square], [square]] } },
  ] };
  assert.deepEqual(polygonRings(geojson).shapes.map(({ properties }) => properties["roof:material"]), ["metal", "thatch", "thatch"]);
});

test("a file saved in Web Mercator metres is refused with a message naming EPSG:4326", () => {
  const mercator = [[-1469166, 945612], [-1469100, 945612], [-1469100, 945680], [-1469166, 945612]];
  assert.throws(() => polygonRings({ type: "Polygon", coordinates: [mercator] }), /EPSG:4326/);
});

test("a shape cut at the tile edge is kept from a tenth of its whole area up, and a smaller piece is dropped", () => {
  const whole = [[-90, 0], [10, 0], [10, 100], [-90, 100], [-90, 0]];
  assert.equal(keepsCutLabel([[0, 0], [10, 0], [10, 100], [0, 100], [0, 0]], whole), true);
  assert.equal(keepsCutLabel([[0, 0], [9, 0], [9, 100], [0, 100], [0, 0]], whole), false);
});

test("a whole shape smaller than the smallest drag box is dropped", () => {
  const speck = [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]];
  assert.equal(keepsCutLabel(speck, speck), false);
  const square = [[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]];
  assert.equal(keepsCutLabel(square, square), true);
});

test("the dataset count adds objects over the listed tiles and ignores objects stored for other tiles", () => {
  const tiles = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const objects = new Map([["a", [{}, {}]], ["b", []], ["c", [{}]], ["gone", [{}, {}, {}]]]);
  assert.deepEqual(datasetCounts(tiles, objects), { objects: 3, tilesWithObjects: 2, tiles: 3 });
});

test("a tile not yet opened counts as a tile without objects", () => {
  assert.deepEqual(datasetCounts([{ id: "a" }], new Map()), { objects: 0, tilesWithObjects: 0, tiles: 1 });
});

test("the target line is reached at the target and stays full past it", () => {
  assert.deepEqual(targetProgress(999, 1000), { percent: 99.9, reached: false });
  assert.deepEqual(targetProgress(1000, 1000), { percent: 100, reached: true });
  assert.deepEqual(targetProgress(1500, 1000), { percent: 100, reached: true });
});

test("a promise still running is shared for its key, and a failed one is dropped so the next call starts again", async () => {
  const map = new Map();
  let calls = 0;
  const pending = remembered(map, "tile", () => {
    calls += 1;
    return new Promise(() => {});
  });
  assert.equal(remembered(map, "tile", () => assert.fail("created twice")), pending);
  assert.equal(calls, 1);
  const failed = remembered(map, "broken", () => Promise.reject(new Error("offline")));
  await assert.rejects(failed, /offline/);
  const retried = remembered(map, "broken", () => Promise.resolve("ok"));
  assert.notEqual(retried, failed);
  assert.equal(await retried, "ok");
});

test("the summary names the most common value, the first one on a tie, against the target", () => {
  assert.equal(valueSummary(["metal", "roof tiles", "concrete"], [12, 1312, 40], 1000), "Most common: roof tiles, 1,312\u00a0of\u00a01,000");
  assert.equal(valueSummary(["metal", "concrete"], [5, 5], 1000), "Most common: metal, 5\u00a0of\u00a01,000");
});

test("a label downloaded in labels.geojson comes back on its tile within half a pixel, with its value", () => {
  const tile = { id: "20-485867-499535", zoom: 20, x: 485867, y: 499535, cells: [], template: "https://tiles.example/{z}/{x}/{y}" };
  const outline = [[100.5, 200.25], [400, 210], [380.75, 600], [90, 590.5], [100.5, 200.25]];
  const geojson = labelsGeojson([tile], new Map([[tile.id, [{ outline, source: "EdgeTAM", value: "metal" }]]]), { mode: "segment", objectName: "building", attribute: "roof:material", values: ["metal", "concrete"], pixels: 1024 });
  const [{ ring, properties }] = polygonRings(JSON.parse(JSON.stringify(geojson))).shapes;
  const back = ring.map((point) => lonLatToPixel(tile, point, 1024));
  for (const point of outline) assert.ok(back.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 0.5), `${point} came back`);
  assert.equal(properties.tile_id, tile.id);
  assert.deepEqual(fileSettings(geojson, [{ ring, properties }]), { objectName: "building", attribute: "roof:material", values: "metal, concrete" });
});

test("loading labels.geojson again on a narrower share keeps labels on unlisted tiles, skips repeats and cuts other files across tiles", () => {
  const first = { id: "20-485867-499535", zoom: 20, x: 485867, y: 499535, cells: [], template: "https://tiles.example/{z}/{x}/{y}" };
  const second = { ...first, id: "20-485868-499535", x: 485868 };
  const square = [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]];
  const file = labelsGeojson([first, second], new Map([[first.id, [{ outline: square, source: "EdgeTAM", value: "metal" }]], [second.id, [{ outline: square, source: "EdgeTAM", value: "concrete" }]]]), { mode: "segment", objectName: "building", attribute: "roof:material", values: ["metal", "concrete"], pixels: 1024 });
  const { shapes } = polygonRings(JSON.parse(JSON.stringify(file)));
  const clip = (ring) => (ring.every(([x, y]) => x >= 0 && x <= 1024 && y >= 0 && y <= 1024) ? ring : null);
  const options = { shapes, tiles: [first], fileName: "labels.geojson", attribute: "roof:material", pixels: 1024, clip, shapesOf: (object) => [object.outline] };
  const loaded = placedLabels({ ...options, objects: new Map() });
  assert.deepEqual([loaded.count, loaded.repeated, loaded.unlisted], [2, 0, 1]);
  assert.equal(loaded.objects.get(second.id)[0].value, "concrete");
  const again = placedLabels({ ...options, objects: loaded.objects });
  assert.deepEqual([again.count, again.objects.get(first.id).length, again.objects.get(second.id).length], [2, 1, 1]);
  const kept = placedLabels({ ...options, fileName: "copy.geojson", objects: loaded.objects });
  assert.deepEqual([kept.count, kept.repeated], [0, 2]);
  const plain = { type: "FeatureCollection", features: file.features.map((feature) => ({ ...feature, properties: { building: "yes" } })) };
  const cut = placedLabels({ ...options, shapes: polygonRings(plain).shapes, tiles: [first, second], objects: new Map() });
  assert.equal(cut.objects.get(first.id).length, 1);
  assert.equal(cut.unlisted, 0);
});

test("a label downloaded as a rotated box counts as a repeat of the outline it came from, and a tile_id at another zoom is cut like any ring", () => {
  const tile = { id: "20-485867-499535", zoom: 20, x: 485867, y: 499535, cells: [], template: "https://tiles.example/{z}/{x}/{y}" };
  const turn = ([x, y]) => [400 + (x - 200) * Math.cos(Math.PI / 6) - (y - 200) * Math.sin(Math.PI / 6), 400 + (x - 200) * Math.sin(Math.PI / 6) + (y - 200) * Math.cos(Math.PI / 6)];
  const ell = [[100, 100], [300, 100], [300, 150], [150, 150], [150, 300], [100, 300], [100, 100]].map(turn);
  const box = [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]].map(turn);
  const file = labelsGeojson([tile], new Map([[tile.id, [{ corners: box.slice(0, 4), source: "EdgeTAM" }]]]), { mode: "obb", objectName: "building", pixels: 1024 });
  const { shapes } = polygonRings(JSON.parse(JSON.stringify(file)));
  const objects = new Map([[tile.id, [{ outline: ell, source: "EdgeTAM" }]]]);
  const options = { shapes, tiles: [tile], objects, fileName: "labels_obb.geojson", attribute: "", pixels: 1024, clip: (ring) => ring };
  assert.equal(placedLabels({ ...options, shapesOf: (object) => [object.outline] }).repeated, 0);
  assert.equal(placedLabels({ ...options, shapesOf: (object) => [object.outline, box] }).repeated, 1);
  const otherZoom = shapes.map((shape) => ({ ...shape, properties: { ...shape.properties, tile_id: "19-242933-249767" } }));
  const cut = placedLabels({ ...options, shapes: otherZoom, objects: new Map(), shapesOf: (object) => [object.outline] });
  assert.deepEqual([cut.count, cut.unlisted], [1, 0]);
});

test("tileGrid gives each tile its square in longitude and latitude and whether it has labels", () => {
  const tiles = [{ id: "1-0-0", zoom: 1, x: 0, y: 0 }, { id: "1-1-1", zoom: 1, x: 1, y: 1 }];
  const grid = tileGrid(tiles, new Map([["1-0-0", [{}]], ["1-1-1", []]]), new Set(["1-0-0"]));
  assert.deepEqual(grid.features.map((feature) => feature.properties), [{ index: 0, tile_id: "1-0-0", listed: true, labelled: true, viewed: false }, { index: 1, tile_id: "1-1-1", listed: false, labelled: false, viewed: false }]);
  const [west, north] = grid.features[0].geometry.coordinates[0][0];
  const [east, south] = grid.features[0].geometry.coordinates[0][2];
  assert.equal(west, -180);
  assert.equal(east, 0);
  assert.equal(south, 0);
  assert.ok(Math.abs(north - 85.0511) < 0.001);
});

test("projectTiles lists every tile in the results, including tiles without a volunteer answer", () => {
  const unmapped = grid("20-485850-499534", 485850, []).map((row) => ({ ...row, total_count: 0 }));
  const { tiles, mapped } = projectTiles([...grid("20-485848-499534", 485848, [9, 2]), ...unmapped], 50);
  assert.deepEqual(tiles.map((tile) => [tile.id, tile.cells]), [["20-485848-499534", [2, 9]], ["20-485850-499534", []]]);
  assert.deepEqual([...mapped], ["20-485848-499534"]);
});

test("withSavedTiles adds tiles with saved labels and the last open tile after the listed ones", () => {
  const all = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const listed = [{ id: "b" }];
  const saved = { tile: "d", objects: { a: [{}], b: [{}], c: [] } };
  assert.deepEqual(withSavedTiles(listed, all, saved).map((tile) => tile.id), ["b", "a", "d"]);
  assert.deepEqual(withSavedTiles(listed, all, null).map((tile) => tile.id), ["b"]);
});

test("viewed tiles are restored, older Done marks count as viewed, they stay listed after a reload, merge from old saves and show on the grid", () => {
  const saved = { tile: "a", objects: {}, viewed: ["c"], done: ["b"] };
  assert.deepEqual([...restoredObjects(saved, [{ id: "a" }]).viewed].toSorted(), ["b", "c"]);
  assert.deepEqual(withSavedTiles([{ id: "a" }], [{ id: "a" }, { id: "b" }, { id: "c" }], { tile: "a", objects: {}, viewed: ["c"] }).map((tile) => tile.id), ["a", "c"]);
  assert.deepEqual(mergedSaves([{ objects: {}, viewed: ["c"] }, { objects: {}, viewed: ["d", "c"] }, { objects: {} }]).viewed, ["c", "d"]);
  const tiles = [{ id: "1-0-0", zoom: 1, x: 0, y: 0 }];
  assert.equal(tileGrid(tiles, new Map(), new Set(["1-0-0"]), new Set(["1-0-0"])).features[0].properties.viewed, true);
});

test("tiles.geojson gives every listed tile its label count, whether it was viewed and its own imagery URL", () => {
  const template = "https://tiles.example/{z}/{x}/{y}.png";
  const tiles = [{ id: "1-0-0", zoom: 1, x: 0, y: 0, template }, { id: "1-1-1", zoom: 1, x: 1, y: 1, template }];
  const objects = new Map([["1-0-0", [{}, {}]]]);
  const file = tilesGeojson(tiles, objects, new Set(["1-1-1"]), 2);
  assert.equal(file.imagery_url, template);
  assert.deepEqual(file.features.map((feature) => feature.properties), [{ tile_id: "1-0-0", labels: 2, viewed: false, url: "https://tiles.example/1/0/0.png", pixels: 256 }, { tile_id: "1-1-1", labels: 0, viewed: true, url: "https://tiles.example/1/1/1.png", pixels: 256 }]);
  assert.equal(file.features[0].geometry.type, "Polygon");
});

test("tilesFileViewed reads viewed tiles back from tiles.geojson and leaves label files and mixed files alone", () => {
  const tiles = [{ id: "1-0-0", zoom: 1, x: 0, y: 0, template: "https://tiles.example/{z}/{x}/{y}.png" }, { id: "1-1-1", zoom: 1, x: 1, y: 1, template: "https://tiles.example/{z}/{x}/{y}.png" }];
  const file = JSON.parse(JSON.stringify(tilesGeojson(tiles, new Map([["1-0-0", [{}]]]), new Set(["1-1-1"]), 2)));
  assert.deepEqual(tilesFileViewed(file), ["1-1-1"]);
  const labels = labelsGeojson([TILE], new Map([[TILE.id, [{ corners: [[0, 0], [10, 0], [10, 10], [0, 10]], source: "EdgeTAM" }]]]), { mode: "obb", objectName: "tank", pixels: 1024 });
  assert.equal(tilesFileViewed(labels), null);
  assert.equal(tilesFileViewed({ ...file, features: [...file.features, ...labels.features] }), null);
  assert.equal(tilesFileViewed({ type: "FeatureCollection", features: [] }), null);
  const doneFile = { ...file, features: file.features.map(({ properties: { viewed, ...rest }, ...feature }) => ({ ...feature, properties: { ...rest, done: viewed } })) };
  assert.deepEqual(tilesFileViewed(doneFile), ["1-1-1"]);
});

test("ringOnTiles cuts a box drawn across a tile edge into one part per tile, keeps every part except a strip thinner than a drag box, keeps a box inside one tile whole, and skips tiles it misses", () => {
  const left = { id: "20-100-100", zoom: 20, x: 100, y: 100, cells: [] };
  const right = { id: "20-101-100", zoom: 20, x: 101, y: 100, cells: [] };
  const far = { id: "20-300-300", zoom: 20, x: 300, y: 300 };
  const clamp = (ring) => ring.map(([x, y]) => [Math.min(1024, Math.max(0, x)), Math.min(1024, Math.max(0, y))]);
  const box = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]].map((point) => labelsGeojson([left], new Map([[left.id, [{ outline: [point, point, point, point] }]]]), { mode: "segment", objectName: "", pixels: 1024 }).features[0].geometry.coordinates[0][0]);
  const across = ringOnTiles(box(824, 100, 1224, 400), [left, right, far], 1024, clamp);
  assert.deepEqual(across.map(({ tile }) => tile.id), [left.id, right.id]);
  assert.ok(Math.abs(across[0].outline[0][0] - 824) < 0.5 && Math.abs(across[1].outline[1][0] - 200) < 0.5);
  assert.deepEqual(ringOnTiles(box(100, 100, 300, 300), [left, right, far], 1024, clamp).map(({ tile }) => tile.id), [left.id]);
  assert.deepEqual(ringOnTiles(box(1016, 100, 1300, 400), [left, right], 1024, clamp).map(({ tile }) => tile.id), [left.id, right.id]);
  assert.deepEqual(ringOnTiles(box(1023.95, 100, 1300, 400), [left, right], 1024, clamp).map(({ tile }) => tile.id), [right.id]);
  assert.deepEqual(ringOnTiles(box(500, 100, 1025, 400), [left, right], 1024, clamp).map(({ tile }) => tile.id), [left.id]);
});

test("ringOnTiles cuts an angled box at the tile line into the exact part on each tile", () => {
  const left = { id: "20-100-100", zoom: 20, x: 100, y: 100, cells: [] };
  const right = { id: "20-101-100", zoom: 20, x: 101, y: 100, cells: [] };
  const toLonLat = (point) => labelsGeojson([left], new Map([[left.id, [{ outline: [point, point, point, point] }]]]), { mode: "segment", objectName: "", pixels: 1024 }).features[0].geometry.coordinates[0][0];
  const clipEdge = (points, inside, cross) => points.flatMap((point, index) => {
    const previous = points.at(index - 1);
    if (inside(point)) return inside(previous) ? [point] : [cross(previous, point), point];
    return inside(previous) ? [cross(previous, point)] : [];
  });
  const at = (axis, value) => (a, b) => { const t = (value - a[axis]) / (b[axis] - a[axis]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
  const clip = (ring) => {
    let points = ring.slice(0, -1);
    for (const [axis, value, keep] of [[0, 0, (v) => v >= 0], [0, 1024, (v) => v <= 1024], [1, 0, (v) => v >= 0], [1, 1024, (v) => v <= 1024]]) points = clipEdge(points, (point) => keep(point[axis]), at(axis, value));
    return points.length > 2 ? [...points, points[0]] : null;
  };
  const drawn = [[900, 300], [1100, 400], [1060, 480], [860, 380], [900, 300]];
  const parts = ringOnTiles(drawn.map(toLonLat), [left, right], 1024, clip);
  assert.deepEqual(parts.map(({ tile }) => tile.id), [left.id, right.id]);
  const shifted = parts[1].outline.map(([x, y]) => [x + 1024, y]);
  assert.ok(Math.abs(ringArea(parts[0].outline) + ringArea(shifted) - ringArea(drawn)) < 0.01 * ringArea(drawn));
});

test("a hand-drawn label stays drawn by hand through two downloads and reloads of labels.geojson, and a model label does not", () => {
  const square = [[0, 0], [1024, 0], [1024, 1024], [0, 1024], [0, 0]];
  let objects = new Map([[TILE.id, [{ outline: [[100, 100], [400, 100], [400, 300], [100, 100]], source: "drawn by hand" }, { outline: [[600, 100], [900, 100], [900, 300], [600, 100]], source: "EdgeTAM" }]]]);
  for (const fileName of ["first.geojson", "second.geojson"]) {
    const { shapes } = polygonRings(labelsGeojson([TILE], objects, { mode: "obb", objectName: "pothole", pixels: 1024 }));
    objects = placedLabels({ shapes, tiles: [TILE], objects: new Map(), fileName, attribute: "", pixels: 1024, clip: (ring) => ring, shapesOf: () => [square] }).objects;
    assert.deepEqual(objects.get(TILE.id).map(keepsDrawnShape), [true, false], fileName);
  }
});

test("a TiTiler tile URL with @1x gives one image at 4 times the pixels, and other URLs give the 256 pixel tile", () => {
  const titiler = { zoom: 20, x: 485884, y: 499536, template: "https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?url=https://example.org/image.tif" };
  assert.deepEqual(detailImage(titiler, 2), { url: "https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/20/485884/499536@4x?url=https://example.org/image.tif", pixels: 1024 });
  assert.deepEqual(detailImage(titiler, 1), { url: "https://titiler.hotosm.org/cog/tiles/WebMercatorQuad/20/485884/499536@2x?url=https://example.org/image.tif", pixels: 512 });
  assert.equal(detailImage(titiler, 3).pixels, 256);
  assert.deepEqual(detailImage({ zoom: 20, x: 1, y: 2, template: "https://tiles.example/{z}/{x}/{y}.png" }, 2), { url: "https://tiles.example/20/1/2.png", pixels: 256 });
  assert.deepEqual(detailImage({ zoom: 20, x: 1, y: 2, template: "https://tiles.example/{z}/{x}/{y}@2x.png?url=s3://bucket/scene@1x.tif" }, 2), { url: "https://tiles.example/20/1/2@2x.png?url=s3://bucket/scene@1x.tif", pixels: 256 });
});

test("mergedSelection replaces on a click, adds a box and toggles on Shift+click", () => {
  const [a, b, c] = [{ id: "a" }, { id: "b" }, { id: "c" }].map((object) => ({ tileId: "t", object }));
  assert.deepEqual(mergedSelection([a, b], [c], "replace"), [c]);
  assert.deepEqual(mergedSelection([a], [b, c, b], "add"), [a, b, c]);
  assert.deepEqual(mergedSelection([a], [b], "toggle"), [a, b]);
  assert.deepEqual(mergedSelection([a, b], [b], "toggle"), [a]);
  assert.deepEqual(mergedSelection([a], [a, b], "toggle"), [a, b]);
  assert.deepEqual(mergedSelection([a], [], "toggle"), [a]);
  assert.deepEqual(mergedSelection([a], [], "replace"), []);
});

test("mergedSelection toggles tile ids with a key function", () => {
  const id = (value) => value;
  assert.deepEqual(mergedSelection(["a"], ["b", "a"], "add", id), ["a", "b"]);
  assert.deepEqual(mergedSelection(["a", "b"], ["a"], "toggle", id), ["b"]);
});

test("setStep walks a tile set in list order and stops at its ends", () => {
  const tiles = ["t0", "t1", "t2", "t3", "t4"].map((id) => ({ id }));
  const set = ["t4", "t1", "t3"];
  assert.equal(setStep(tiles, set, -1, 1), 1);
  assert.equal(setStep(tiles, set, 4, -1), 3);
  assert.equal(setStep(tiles, set, 1, 1), 3);
  assert.equal(setStep(tiles, set, 4, 1), null);
  assert.equal(setStep(tiles, set, 3, -1), 1);
  assert.equal(setStep(tiles, set, 1, -1), null);
  assert.equal(setStep(tiles, set, 2, 1), 3);
});

test("agreementEdges outlines each tile's passed cells and skips tiles without them", () => {
  const tile = { id: "a", x: 0, y: 0, zoom: 1, size: 2, cells: [0, 1] };
  const { features } = agreementEdges([tile, { ...tile, id: "b", cells: [] }]);
  assert.equal(features.length, 1);
  assert.equal(features[0].geometry.coordinates.length, 6);
  assert.deepEqual(features[0].geometry.coordinates[0].map(([longitude, latitude]) => [longitude, Number(latitude.toFixed(6))]), [[-180, 85.051129], [-90, 85.051129]]);
});
