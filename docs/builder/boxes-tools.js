import { imageryTemplate, passesThreshold, subGridSize, tileFractionToLonLat } from "./results-tools.js";

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

// The sides of marked cells that do not touch another marked cell, as [start, end] point pairs.
export function markedAreaEdges(cells, size, pixels) {
  const marked = new Set(cells);
  const edges = [];
  for (const cell of cells) {
    const [left, top, right, bottom] = cellRectangle(cell, size, pixels);
    const column = cell % size;
    if (!marked.has(cell - size)) edges.push([[left, top], [right, top]]);
    if (!marked.has(cell + size)) edges.push([[left, bottom], [right, bottom]]);
    if (column === 0 || !marked.has(cell - 1)) edges.push([[left, top], [left, bottom]]);
    if (column === size - 1 || !marked.has(cell + 1)) edges.push([[right, top], [right, bottom]]);
  }
  return edges;
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

function signedRingArea(ring) {
  return ring.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0) / 2;
}

function ringArea(ring) {
  return Math.abs(signedRingArea(ring));
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

function pixelToLonLat(tile, [x, y], pixels) {
  return tileFractionToLonLat(tile.x + x / pixels, tile.y + y / pixels, tile.zoom);
}

// RFC 7946 asks for counterclockwise outer rings, so a clockwise ring is reversed.
function lonLatRing(tile, ring, pixels) {
  const lonLat = ring.map((point) => pixelToLonLat(tile, point, pixels));
  return signedRingArea(lonLat) < 0 ? lonLat.toReversed() : lonLat;
}

export function labelsGeojson(tiles, objects, { mode, objectName, pixels }) {
  const features = tiles.flatMap((tile) =>
    (objects.get(tile.id) ?? []).map(({ box, outline, source }) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [lonLatRing(tile, mode === "segment" ? outline : boxOutline(box), pixels)] },
      properties: { tile_id: tile.id, image: `images/${tile.id}.jpg`, object_name: objectName, output: mode === "segment" ? "outline" : "box", source, marked_cells: tile.cells.length, imagery_url: tile.template },
    })));
  return { type: "FeatureCollection", features };
}

export function datasetReadme({ projectName, projectLink, threshold, modelName, mode, objectName, tiles, objectCount, pixels, detailLevels }) {
  const templates = [...new Set(tiles.map((tile) => tile.template))];
  return `# ${projectName}

YOLO ${mode === "segment" ? "segmentation" : "detection"} dataset of "${objectName}", marked with the Locate auto labeller.

- Project: ${projectLink}
- Volunteer share: ${threshold}%
- Model: ${modelName}
- Images: ${tiles.length}, objects: ${objectCount}

## Files

- \`images/\`: one ${pixels} x ${pixels} JPEG per tile, named by tile ID (zoom-x-y).
- \`labels/\`: one YOLO label file per image.
- \`data.yaml\`: the dataset file for Ultralytics.
- \`labels.geojson\`: every object as a polygon in longitude and latitude (EPSG:4326), with its tile, source and imagery.

## Open in QGIS

1. In the **Browser** panel, right-click **XYZ Tiles** and choose **New Connection**. Enter a **Name**, paste ${templates.length === 1 ? "this URL" : "one of these URLs"} into **URL**, tick **Max. Zoom Level** and set it to ${tiles[0].zoom + detailLevels}, and click **OK**.

${templates.map((template) => `   \`\`\`text\n   ${template}\n   \`\`\``).join("\n\n")}

2. Expand **XYZ Tiles** and double-click the new connection to add the imagery to the map.
3. Drag \`labels.geojson\` into QGIS. It draws above the imagery.
`;
}
