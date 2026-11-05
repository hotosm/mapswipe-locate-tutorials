import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import { unpacked } from "../docs/builder/results-file.js";

test("a gzipped results file unpacks to its CSV text", async () => {
  const csv = "task_id,0_count\n20-1-2,3\n";
  assert.equal(await (await unpacked(new Blob([gzipSync(csv)]))).text(), csv);
});

test("a plain CSV file comes back unchanged", async () => {
  const file = new Blob(["task_id,0_count\n"]);
  assert.equal(await unpacked(file), file);
});
