import assert from "node:assert/strict";
import { test } from "node:test";

import { LABEL_PROPERTIES, attributeValues, boxOutline, cellRectangle, clampedCorners, classIndex, datasetCounts, datasetReadme, datasetYaml, detailTiles, dragBox, isDrag, isOutsideImage, keepsCutLabel, keptTiles, labelSettings, labelsGeojson, largestRing, lonLatToPixel, markedAreaEdges, maskBox, obbLabels, objectsWithoutValue, polygonRings, rectangleFromSide, restoredObjects, rotatedBox, savedObjectsKey, segmentLabels, targetProgress, valueCounts, valueForKey } from "../docs/builder/boxes-tools.js";

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

test("the dataset file names the object as a quoted YAML string", () => {
  assert.equal(datasetYaml(['solar "panel"']), 'train: images\nval: images\nnames:\n  0: "solar \\"panel\\""\n');
});

test("the dataset file numbers each attribute value as its own class, in list order", () => {
  assert.equal(datasetYaml(["metal", "roof_tiles"]), 'train: images\nval: images\nnames:\n  0: "metal"\n  1: "roof_tiles"\n');
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

test("restored objects keep only listed tiles and reopen the saved tile, or the first tile when it is gone", () => {
  const tiles = [{ id: "20-1-1" }, { id: "20-2-1" }];
  const object = { outline: [[0, 0], [10, 0], [10, 10], [0, 0]] };
  const restored = restoredObjects({ tile: "20-2-1", objects: { "20-2-1": [object], "20-9-9": [object] } }, tiles);
  assert.deepEqual([...restored.objects], [["20-2-1", [object]]]);
  assert.equal(restored.index, 1);
  assert.equal(restoredObjects({ tile: "20-9-9", objects: {} }, tiles).index, 0);
  assert.deepEqual(restoredObjects(null, tiles), { objects: new Map(), index: 0 });
});

test("filled setup fields win over the saved settings, and empty ones take the saved settings", () => {
  const saved = { objectName: "building", attribute: "roof:material", values: "metal, thatch" };
  assert.deepEqual(labelSettings({ objectName: "", attribute: "", values: "" }, saved), saved);
  assert.deepEqual(labelSettings({ objectName: "tree", attribute: "natural", values: "tree, tree_group" }, saved), { objectName: "tree", attribute: "natural", values: "tree, tree_group" });
  assert.deepEqual(labelSettings({ objectName: "", attribute: "natural", values: "" }, saved), { objectName: "building", attribute: "natural", values: "" });
  assert.deepEqual(labelSettings({ objectName: "", attribute: "", values: "" }, null), { objectName: "", attribute: "", values: "" });
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

test("objects are saved per project and share, and results without a project id fail with a message", () => {
  assert.equal(savedObjectsKey([{ project_internal_id: 3451 }], 50), "box-helper-objects:3451:50");
  assert.throws(() => savedObjectsKey([{ task_id: "20-1-1" }], 50), /project_internal_id/);
  assert.throws(() => savedObjectsKey([{ project_internal_id: null }], 50), /project_internal_id/);
});

test("the outline is the outer ring with the largest area, even when a smaller ring has more points", () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
  const speck = [[200, 200], [201, 200], [202, 200], [203, 200], [203, 201], [202, 201], [201, 201], [200, 201], [200, 200]];
  const hole = [[10, 10], [90, 10], [90, 90], [10, 90], [10, 10]];
  assert.deepEqual(largestRing([[speck], [square, hole]]), square);
  assert.deepEqual(largestRing([[square, hole], [speck]]), square);
});

test("segment labels give each outline as shares of the image side and drop the repeated closing point", () => {
  assert.equal(segmentLabels([{ classIndex: 0, outline: [[0, 0], [512, 0], [512, 256], [0, 0]] }, { classIndex: 2, outline: [[1024, 1024], [512, 1024], [768, 512]] }], 1024),
    "0 0.000000 0.000000 0.500000 0.000000 0.500000 0.250000\n2 1.000000 1.000000 0.500000 1.000000 0.750000 0.500000");
});

test("a hand-drawn box becomes a closed four-corner outline that labels as the box corners", () => {
  const outline = boxOutline([256, 512, 768, 1024]);
  assert.deepEqual(outline, [[256, 512], [768, 512], [768, 1024], [256, 1024], [256, 512]]);
  assert.equal(segmentLabels([{ classIndex: 0, outline }], 1024), "0 0.250000 0.500000 0.750000 0.500000 0.750000 1.000000 0.250000 1.000000");
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
  assert.deepEqual(feature.properties, { tile_id: TILE.id, image: `images/${TILE.id}.jpg`, object_name: "tank", output: "rotated box", source: "EdgeTAM", marked_cells: 2, imagery_url: TILE.template });
});

test("with an attribute, each feature carries its own value under the attribute name", () => {
  const objects = new Map([[TILE.id, [{ corners: [[0, 0], [512, 0], [512, 512], [0, 512]], source: "EdgeTAM", value: "metal" }, { corners: [[512, 512], [1024, 512], [1024, 1024], [512, 1024]], source: "EdgeTAM", value: "roof_tiles" }]]]);
  const { features } = labelsGeojson([TILE], objects, { mode: "obb", objectName: "building", attribute: "roof:material", pixels: 1024 });
  assert.deepEqual(features.map((feature) => feature.properties["roof:material"]), ["metal", "roof_tiles"]);
  assert.equal(features[0].properties.object_name, "building");
});

test("the YOLO class is the value's place in the list, and 0 without values", () => {
  assert.equal(classIndex({ value: "roof_tiles" }, ["metal", "roof_tiles"]), 1);
  assert.equal(classIndex({}, []), 0);
});

test("the reserved names are exactly the properties each feature carries without an attribute", () => {
  const objects = new Map([[TILE.id, [{ corners: [[0, 0], [512, 0], [512, 512], [0, 512]], source: "EdgeTAM" }]]]);
  const [feature] = labelsGeojson([TILE], objects, { mode: "obb", objectName: "tank", pixels: 1024 }).features;
  assert.deepEqual(Object.keys(feature.properties).toSorted(), LABEL_PROPERTIES.toSorted());
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

test("the readme lists each imagery URL once and the QGIS zoom of the stitched sub-tiles", () => {
  const readme = datasetReadme({ projectName: "Tanks", projectLink: "https://mapswipe.org/en/projects/1/", threshold: 50, modelName: "EdgeTAM", mode: "segment", objectName: "tank", tiles: [TILE, { ...TILE, id: "20-485849-499534" }], objectCount: 3, pixels: 1024, detailLevels: 2 });
  assert.equal(readme.split(TILE.template).length - 1, 1);
  assert.match(readme, /set it to 22,/);
  assert.match(readme, /YOLO segmentation dataset of "tank"/);
  assert.match(readme, /Images: 2, objects: 3/);
});

test("with tiles on two imagery URLs the readme lists both and asks for one connection each", () => {
  const second = { ...TILE, id: "20-485849-499534", template: "https://other.example/{z}/{x}/{y}.png" };
  const readme = datasetReadme({ projectName: "Tanks", projectLink: "https://mapswipe.org/en/projects/1/", threshold: 50, modelName: "EdgeTAM", mode: "obb", objectName: "tank", tiles: [TILE, second], objectCount: 2, pixels: 1024, detailLevels: 2 });
  assert.ok(readme.includes(TILE.template) && readme.includes(second.template));
  assert.match(readme, /paste one of these URLs/);
  assert.match(readme, /YOLO oriented bounding box \(OBB\) dataset/);
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

test("a hand-drawn rotated box runs from the dragged side to the tapped side, on either side of it", () => {
  assert.deepEqual(rectangleFromSide([100, 100], [300, 100], [250, 160]), [[100, 100], [300, 100], [300, 160], [100, 160], [100, 100]]);
  assert.deepEqual(rectangleFromSide([100, 100], [300, 100], [250, 40]), [[100, 100], [300, 100], [300, 40], [100, 40], [100, 100]]);
});

test("rotated box labels list four corners as shares of the image side, kept inside the image", () => {
  const corners = clampedCorners([[-20, 512], [512, -20], [1044, 512], [512, 1044]], 1024);
  assert.equal(obbLabels([{ classIndex: 0, corners }, { classIndex: 1, corners: [[0, 0], [1024, 0], [1024, 1024], [0, 1024]] }], 1024), "0 0.000000 0.500000 0.500000 0.000000 1.000000 0.500000 0.500000 1.000000\n1 0.000000 0.000000 1.000000 0.000000 1.000000 1.000000 0.000000 1.000000");
});

test("rotated boxes go in the GeoJSON as their four corners and the readme names an OBB dataset", () => {
  const corners = [[512, 0], [1024, 512], [512, 1024], [0, 512]];
  const [feature] = labelsGeojson([TILE], new Map([[TILE.id, [{ corners, source: "EdgeTAM" }]]]), { mode: "obb", objectName: "tank", pixels: 1024 }).features;
  const ring = feature.geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.ok(ring.some(([lon, lat]) => Math.abs(lon + 13.197154998779297) < 1e-9 && Math.abs(lat - 8.467618188) < 1e-9));
  assert.equal(feature.properties.output, "rotated box");
  const readme = datasetReadme({ projectName: "Tanks", projectLink: "https://mapswipe.org/en/projects/1/", threshold: 50, modelName: "EdgeTAM", mode: "obb", objectName: "tank", tiles: [TILE], objectCount: 1, pixels: 1024, detailLevels: 2 });
  assert.match(readme, /YOLO oriented bounding box \(OBB\) dataset of "tank"/);
  const byRoof = datasetReadme({ projectName: "Roofs", projectLink: "https://mapswipe.org/en/projects/1/", threshold: 50, modelName: "EdgeTAM", mode: "obb", objectName: "building", attribute: "roof:material", values: ["metal", "roof_tiles"], tiles: [TILE], objectCount: 2, pixels: 1024, detailLevels: 2 });
  assert.match(byRoof, /`roof:material` value, and each value is one class: metal, roof_tiles\./);
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
