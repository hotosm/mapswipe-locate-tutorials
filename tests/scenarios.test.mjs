import assert from "node:assert/strict";
import { test } from "node:test";

import { checkTasks, emptyReferences, nextAnswer, scenarioFile, taskBounds, tileImageUrl } from "../docs/builder/scenarios.js";

test("a click cycles a cell from No to Single to Multiple and back to No", () => {
  assert.deepEqual([0, 1, 2].map(nextAnswer), [1, 2, 0]);
});

test("each sub-grid size gives one reference per cell", () => {
  assert.equal(emptyReferences(2).length, 4);
  assert.equal(emptyReferences(4).length, 16);
  assert.equal(emptyReferences(8).length, 64);
});

test("the tile URL template is filled with the task's tile", () => {
  const template = "https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/62d86c65d8499800053796c4/tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual&nodata=0";
  assert.equal(
    tileImageUrl(template, 773386, 440490, 20),
    "https://api.imagery.hotosm.org/raster/collections/openaerialmap/items/62d86c65d8499800053796c4/tiles/WebMercatorQuad/20/773386/440490?assets=visual&nodata=0",
  );
});

test("bounds cover every task, including multipolygons", () => {
  const tasks = {
    type: "FeatureCollection",
    features: [
      { geometry: { type: "Polygon", coordinates: [[[85.5, 27.6], [85.6, 27.6], [85.6, 27.7], [85.5, 27.6]]] } },
      { geometry: { type: "MultiPolygon", coordinates: [[[[85.4, 27.5], [85.45, 27.5], [85.45, 27.55], [85.4, 27.5]]]] } },
    ],
  };
  assert.deepEqual(taskBounds(tasks), [[85.4, 27.5], [85.6, 27.7]]);
});

test("a file without tiles or polygons is rejected with a clear message", () => {
  const tile = { tile_x: 1, tile_y: 2, tile_z: 20 };
  const square = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  assert.doesNotThrow(() => checkTasks({ type: "FeatureCollection", features: [{ geometry: square, properties: tile }] }));
  for (const bad of [{}, { type: "FeatureCollection" }, { type: "FeatureCollection", features: [{ geometry: square, properties: {} }] }, { type: "FeatureCollection", features: [{ properties: tile }] }]) {
    assert.throws(() => checkTasks(bad), /processed tasks GeoJSON/);
  }
});

test("the export numbers screens in order and keeps each tile's references", () => {
  const square = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const references = emptyReferences(2);
  references[3] = 2;
  const file = scenarioFile([
    { geometry: square, tileX: 1, tileY: 2, tileZ: 20, references },
    { geometry: square, tileX: 3, tileY: 4, tileZ: 20, references: emptyReferences(2) },
  ]);
  assert.deepEqual(
    file.features.map((feature) => feature.properties),
    [
      { tile_x: 1, tile_y: 2, tile_z: 20, screen: 1, references: [0, 0, 0, 2] },
      { tile_x: 3, tile_y: 4, tile_z: 20, screen: 2, references: [0, 0, 0, 0] },
    ],
  );
});
