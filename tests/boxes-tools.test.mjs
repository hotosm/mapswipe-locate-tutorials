import assert from "node:assert/strict";
import { test } from "node:test";

import { boxOutline, cellRectangle, datasetReadme, datasetYaml, detailTiles, dragBox, isDrag, isOutsideImage, keptTiles, labelsGeojson, largestRing, markedAreaEdges, maskBox, restoredObjects, savedObjectsKey, segmentLabels, yoloLabels } from "../docs/builder/boxes-tools.js";

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

test("YOLO labels give the box centre and size as shares of the image side", () => {
  assert.equal(yoloLabels([[0, 0, 512, 256], [256, 512, 1024, 1024]], 1024), "0 0.250000 0.125000 0.500000 0.250000\n0 0.625000 0.750000 0.750000 0.500000");
  assert.equal(yoloLabels([], 1024), "");
});

test("the dataset file names the object as a quoted YAML string", () => {
  assert.equal(datasetYaml('solar "panel"'), 'train: images\nval: images\nnames:\n  0: "solar \\"panel\\""\n');
});

test("restored objects keep only listed tiles and reopen the saved tile, or the first tile when it is gone", () => {
  const tiles = [{ id: "20-1-1" }, { id: "20-2-1" }];
  const object = { box: [0, 0, 10, 10], outline: [[0, 0], [10, 0], [10, 10], [0, 0]] };
  const restored = restoredObjects({ tile: "20-2-1", objects: { "20-2-1": [object], "20-9-9": [object] } }, tiles);
  assert.deepEqual([...restored.objects], [["20-2-1", [object]]]);
  assert.equal(restored.index, 1);
  assert.equal(restoredObjects({ tile: "20-9-9", objects: {} }, tiles).index, 0);
  assert.deepEqual(restoredObjects(null, tiles), { objects: new Map(), index: 0 });
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
  assert.equal(segmentLabels([[[0, 0], [512, 0], [512, 256], [0, 0]], [[1024, 1024], [512, 1024], [768, 512]]], 1024),
    "0 0.000000 0.000000 0.500000 0.000000 0.500000 0.250000\n0 1.000000 1.000000 0.500000 1.000000 0.750000 0.500000");
});

test("a hand-drawn box becomes a closed four-corner outline that labels as the box corners", () => {
  const outline = boxOutline([256, 512, 768, 1024]);
  assert.deepEqual(outline, [[256, 512], [768, 512], [768, 1024], [256, 1024], [256, 512]]);
  assert.equal(segmentLabels([outline], 1024), "0 0.250000 0.500000 0.750000 0.500000 0.750000 1.000000 0.250000 1.000000");
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
  const objects = new Map([[TILE.id, [{ box: [0, 0, 1024, 1024], outline: [], source: "EdgeTAM" }]]]);
  const [feature] = labelsGeojson([TILE], objects, { mode: "detect", objectName: "tank", pixels: 1024 }).features;
  const ring = feature.geometry.coordinates[0];
  const corners = ring.map(([lon, lat]) => `${lon.toFixed(9)},${lat.toFixed(9)}`);
  assert.ok(corners.includes("-13.197326660,8.467618188"));
  assert.ok(corners.includes("-13.196983337,8.467278608"));
  assert.deepEqual(ring[0], ring.at(-1));
  assert.deepEqual(feature.properties, { tile_id: TILE.id, image: `images/${TILE.id}.jpg`, object_name: "tank", output: "box", source: "EdgeTAM", marked_cells: 2, imagery_url: TILE.template });
});

test("boxes and outlines both come out with counterclockwise outer rings", () => {
  const clockwiseInImage = [[0, 0], [512, 0], [512, 512], [0, 0]];
  const counterclockwiseInImage = clockwiseInImage.toReversed();
  for (const [mode, object] of [["detect", { box: [0, 0, 512, 512] }], ["segment", { outline: clockwiseInImage }], ["segment", { outline: counterclockwiseInImage }]]) {
    const [feature] = labelsGeojson([TILE], new Map([[TILE.id, [{ ...object, source: "EdgeTAM" }]]]), { mode, objectName: "tank", pixels: 1024 }).features;
    assert.ok(signedArea(feature.geometry.coordinates[0]) > 0, `${mode} ${JSON.stringify(object)}`);
  }
});

test("outlines use the outline points and tiles without objects add nothing", () => {
  const objects = new Map([[TILE.id, [{ box: [0, 0, 1, 1], outline: [[512, 256], [1024, 256], [1024, 512], [512, 256]], source: "drawn by hand" }]], ["other", []]]);
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
  const readme = datasetReadme({ projectName: "Tanks", projectLink: "https://mapswipe.org/en/projects/1/", threshold: 50, modelName: "EdgeTAM", mode: "detect", objectName: "tank", tiles: [TILE, second], objectCount: 2, pixels: 1024, detailLevels: 2 });
  assert.ok(readme.includes(TILE.template) && readme.includes(second.template));
  assert.match(readme, /paste one of these URLs/);
  assert.match(readme, /YOLO detection dataset/);
});
