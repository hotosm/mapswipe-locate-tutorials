import assert from "node:assert/strict";
import { test } from "node:test";

import { boxOutline, cellRectangle, datasetYaml, detailTiles, dragBox, isDrag, isOutsideImage, keptTiles, largestRing, maskBox, restoredObjects, savedObjectsKey, segmentLabels, yoloLabels } from "../docs/builder/boxes-tools.js";

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
