import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { EXAMPLE, checkTasks } from "../docs/builder/scenarios.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../docs/examples/files/${name}`, import.meta.url)));

test("the scenario builder's example button points at tasks that load", () => {
  const tasks = JSON.parse(readFileSync(new URL(EXAMPLE.tasks, new URL("../docs/builder/", import.meta.url))));
  assert.doesNotThrow(() => checkTasks(tasks));
});

test("every Banepa example scenario is a tile of the example tasks, with one answer per 4x4 cell", () => {
  const tiles = new Set(read("banepa-water-tanks-processed-tasks.geojson").features.map(({ properties }) => `${properties.tile_x}/${properties.tile_y}`));
  const scenarios = read("banepa-water-tanks-scenarios.geojson").features;
  assert.deepEqual(scenarios.map(({ properties }) => properties.screen), [1, 2, 3]);
  for (const { properties } of scenarios) {
    assert.ok(tiles.has(`${properties.tile_x}/${properties.tile_y}`));
    assert.equal(properties.references.length, 16);
  }
});
