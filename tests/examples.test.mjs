import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { tileCount } from "../docs/builder/area-tools.js";
import { EXAMPLE, checkTasks } from "../docs/builder/scenarios.js";

test("the tutorial builder's example button points at tasks that load", () => {
  const tasks = JSON.parse(readFileSync(new URL(EXAMPLE.tasks, new URL("../docs/builder/", import.meta.url))));
  assert.doesNotThrow(() => checkTasks(tasks));
});

test("the Freetown example's area of interest gives as many tiles as its processed tasks file lists", () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../docs/examples/files/${name}`, import.meta.url)));
  const ring = read("freetown-solar-panels-aoi.geojson").features[0].geometry.coordinates[0];
  const [longitudes, latitudes] = [ring.map(([longitude]) => longitude), ring.map(([, latitude]) => latitude)];
  const bbox = [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
  assert.equal(tileCount(bbox, 20), read("freetown-solar-panels-processed-tasks.geojson").features.length);
});
