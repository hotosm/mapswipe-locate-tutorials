import { imageryTemplate, passesThreshold, subGridSize } from "./results-tools.js";

export const TILE_PIXELS = 256;

// A movement smaller than this across or down, in image pixels, is a tap; a larger one is a drag sent to the model as a box.
export const DRAG_PIXELS = 6;

export function keptTiles(rows, thresholdPercent) {
  const size = subGridSize(rows);
  const tiles = new Map();
  for (const row of rows) {
    if (!passesThreshold(row, thresholdPercent)) continue;
    if (!tiles.has(row.task_id)) {
      tiles.set(row.task_id, { id: row.task_id, x: row.tile_x, y: row.tile_y, zoom: row.tile_z, template: imageryTemplate(row), size, cells: [] });
    }
    tiles.get(row.task_id).cells.push(row.task_partition_index);
  }
  return [...tiles.values()].map((tile) => ({ ...tile, cells: tile.cells.toSorted((a, b) => a - b) }));
}

// The imagery server answers a tile beyond the image edge with 404 "... is outside bounds".
export function isOutsideImage(status, body) {
  return status === 404 && body.includes("outside bounds");
}

// The tile `levels` zoom levels deeper, as sub-tiles placed row by row from the top left.
export function detailTiles(tile, levels) {
  const count = 2 ** levels;
  return Array.from({ length: count * count }, (_, index) => {
    const [column, row] = [index % count, Math.floor(index / count)];
    const url = tile.template.replace("{z}", tile.zoom + levels).replace("{x}", tile.x * count + column).replace("{y}", tile.y * count + row);
    return { url, left: column * TILE_PIXELS, top: row * TILE_PIXELS };
  });
}

export function cellRectangle(cell, size, pixels) {
  const side = pixels / size;
  const [left, top] = [(cell % size) * side, Math.floor(cell / size) * side];
  return [left, top, left + side, top + side];
}

// The smallest box around the set pixels of a mask stored row by row.
export function maskBox(mask, width, height) {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : [left, top, right + 1, bottom + 1];
}

export function savedObjectsKey(rows, threshold) {
  const project = rows[0]?.project_internal_id;
  if (project === undefined || project === null) throw new Error("The results have no project_internal_id column, so the objects cannot be saved for this project.");
  return `box-helper-objects:${project}:${threshold}`;
}

// Saved objects for tiles outside this list are dropped; the saved tile is reopened when it is still listed.
export function restoredObjects(saved, tiles) {
  const ids = new Set(tiles.map((tile) => tile.id));
  const objects = new Map(Object.entries(saved?.objects ?? {}).filter(([id]) => ids.has(id)));
  return { objects, index: Math.max(0, tiles.findIndex((tile) => tile.id === saved?.tile)) };
}

function ringArea(ring) {
  return Math.abs(ring.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0)) / 2;
}

// A mask comes back as one main shape plus specks; the outer ring of the largest polygon is the object's outline.
export function largestRing(polygons) {
  return polygons.map((polygon) => polygon[0]).reduce((largest, ring) => (ringArea(ring) > ringArea(largest) ? ring : largest));
}

export function isDrag(start, end) {
  return Math.abs(end[0] - start[0]) >= DRAG_PIXELS && Math.abs(end[1] - start[1]) >= DRAG_PIXELS;
}

export function dragBox(start, end, pixels) {
  const clamp = (value) => Math.min(pixels, Math.max(0, value));
  const [x1, x2] = [start[0], end[0]].map(clamp).toSorted((a, b) => a - b);
  const [y1, y2] = [start[1], end[1]].map(clamp).toSorted((a, b) => a - b);
  return [x1, y1, x2, y2];
}

// YOLO detection labels: class, then box centre and size as shares of the image side.
export function yoloLabels(boxes, pixels) {
  const share = (value) => (value / pixels).toFixed(6);
  return boxes.map(([x1, y1, x2, y2]) => `0 ${share((x1 + x2) / 2)} ${share((y1 + y2) / 2)} ${share(x2 - x1)} ${share(y2 - y1)}`).join("\n");
}

// A box drawn by hand has no mask, so its outline is the box itself.
export function boxOutline([x1, y1, x2, y2]) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
}

// YOLO segmentation labels: class, then the outline points as shares of the image side, without repeating the first point.
export function segmentLabels(outlines, pixels) {
  const share = (value) => (value / pixels).toFixed(6);
  return outlines.map((ring) => {
    const [first, last] = [ring[0], ring.at(-1)];
    const points = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
    return `0 ${points.map(([x, y]) => `${share(x)} ${share(y)}`).join(" ")}`;
  }).join("\n");
}

// Without a `path` line Ultralytics reads the folders next to this file. Training and validation both use all images.
export function datasetYaml(objectName) {
  return `train: images\nval: images\nnames:\n  0: ${JSON.stringify(objectName)}\n`;
}
