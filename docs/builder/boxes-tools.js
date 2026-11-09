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

// A field filled in the setup card wins; an empty one takes the project's saved setting.
export function labelSettings(entered, saved) {
  const attributeEntered = entered.attribute !== "";
  return {
    objectName: entered.objectName || saved?.objectName || "",
    attribute: attributeEntered ? entered.attribute : saved?.attribute ?? "",
    values: attributeEntered ? entered.values : saved?.values ?? "",
  };
}

// Number keys 1 to 9 pick the value at that place in the list.
export function valueForKey(key, list) {
  return /^[1-9]$/.test(key) ? list[Number(key) - 1] ?? null : null;
}

export function datasetCounts(tiles, objects) {
  const counts = tiles.map((tile) => objects.get(tile.id)?.length ?? 0);
  return { objects: counts.reduce((sum, count) => sum + count, 0), tilesWithObjects: counts.filter((count) => count > 0).length, tiles: tiles.length };
}

// "metal, roof_tiles" becomes ["metal", "roof_tiles"]; each value is one class of the dataset.
export function attributeValues(text) {
  return [...new Set(text.split(",").map((value) => value.trim()).filter(Boolean))];
}

export function valueCounts(tiles, objects, values) {
  const all = tiles.flatMap((tile) => objects.get(tile.id) ?? []);
  return values.map((value) => all.filter((object) => object.value === value).length);
}

// The YOLO class is the value's place in the list, or 0 for a dataset of one object.
export function classIndex(object, values) {
  return values.length > 0 ? values.indexOf(object.value) : 0;
}

// Objects labelled before the value list was set, or with a value taken off it, have no class.
export function objectsWithoutValue(tiles, objects, values) {
  return tiles.flatMap((tile) => objects.get(tile.id) ?? []).filter((object) => !values.includes(object.value)).length;
}

export function targetProgress(objectCount, target) {
  return { percent: Math.min(100, (objectCount / target) * 100), reached: objectCount >= target };
}

function signedRingArea(ring) {
  return ring.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = ring[(index + 1) % ring.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0) / 2;
}

export function ringArea(ring) {
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

// A box drawn by hand has no mask, so its outline is the box itself.
export function boxOutline([x1, y1, x2, y2]) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
}

// The smallest rectangle around a convex ring has one side along a ring edge (Freeman and Shapira, 1975), so each edge is tried.
export function rotatedBox(hull) {
  let best = null;
  for (let index = 0; index < hull.length - 1; index++) {
    const [[x1, y1], [x2, y2]] = [hull[index], hull[index + 1]];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length === 0) continue;
    const [alongX, alongY] = [(x2 - x1) / length, (y2 - y1) / length];
    const along = hull.map(([x, y]) => x * alongX + y * alongY);
    const across = hull.map(([x, y]) => y * alongX - x * alongY);
    const [start, end, near, far] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
    const area = (end - start) * (far - near);
    if (best && area >= best.area) continue;
    const corners = [[start, near], [end, near], [end, far], [start, far]].map(([a, c]) => [a * alongX - c * alongY, a * alongY + c * alongX]);
    best = { area, corners };
  }
  return best.corners;
}

// The YOLO OBB format takes corners between 0 and 1, so corners past the image edge are moved onto it.
export function clampedCorners(corners, pixels) {
  return corners.map((point) => point.map((value) => Math.min(pixels, Math.max(0, value))));
}

// A hand-drawn rotated box: one side from `start` to `end`, the opposite side through `point`.
export function rectangleFromSide(start, end, point) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const [normalX, normalY] = [(start[1] - end[1]) / length, (end[0] - start[0]) / length];
  const depth = (point[0] - start[0]) * normalX + (point[1] - start[1]) * normalY;
  const [shiftX, shiftY] = [normalX * depth, normalY * depth];
  return [start, end, [end[0] + shiftX, end[1] + shiftY], [start[0] + shiftX, start[1] + shiftY], start];
}

// YOLO OBB labels: class, then the four corners as shares of the image side.
export function obbLabels(labels, pixels) {
  const share = (value) => (value / pixels).toFixed(6);
  return labels.map(({ classIndex, corners }) => `${classIndex} ${corners.map(([x, y]) => `${share(x)} ${share(y)}`).join(" ")}`).join("\n");
}

// YOLO segmentation labels: class, then the outline points as shares of the image side, without repeating the first point.
export function segmentLabels(labels, pixels) {
  const share = (value) => (value / pixels).toFixed(6);
  return labels.map(({ classIndex, outline: ring }) => {
    const [first, last] = [ring[0], ring.at(-1)];
    const points = first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
    return `${classIndex} ${points.map(([x, y]) => `${share(x)} ${share(y)}`).join(" ")}`;
  }).join("\n");
}

// Without a `path` line Ultralytics reads the folders next to this file. Training and validation both use all images.
export function datasetYaml(names) {
  return `train: images\nval: images\nnames:\n${names.map((name, index) => `  ${index}: ${JSON.stringify(name)}\n`).join("")}`;
}

function pixelToLonLat(tile, [x, y], pixels) {
  return tileFractionToLonLat(tile.x + x / pixels, tile.y + y / pixels, tile.zoom);
}

export function lonLatToPixel(tile, [longitude, latitude], pixels) {
  const size = 2 ** tile.zoom;
  const x = ((longitude + 180) / 360) * size;
  const y = ((1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2) * size;
  return [(x - tile.x) * pixels, (y - tile.y) * pixels];
}

// Labels drawn in QGIS or exported from OpenStreetMap are polygons in longitude and latitude; each outer ring becomes one object with its feature's properties.
export function polygonRings(geojson) {
  const features = (geojson.type === "FeatureCollection" ? geojson.features : [geojson]).map((feature) => ({ geometry: feature.geometry ?? feature, properties: feature.properties ?? {} }));
  const polygons = features.filter(({ geometry }) => geometry?.type === "Polygon" || geometry?.type === "MultiPolygon");
  const shapes = polygons.flatMap(({ geometry, properties }) => (geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0])).map((ring) => ({ ring, properties })));
  const outside = shapes.flatMap(({ ring }) => ring).find(([longitude, latitude]) => Math.abs(longitude) > 180 || Math.abs(latitude) > 90);
  if (outside) throw new Error(`The position ${outside.join(", ")} is outside longitude and latitude. Save the file again in EPSG:4326.`);
  return { shapes, skipped: features.length - polygons.length };
}

// A shape cut at the tile edge is kept when it holds at least a tenth of the whole shape, the default of SAHI's min_area_ratio, and is no smaller than the smallest drag box.
export function keepsCutLabel(cut, whole) {
  return ringArea(cut) >= Math.max(0.1 * ringArea(whole), DRAG_PIXELS ** 2);
}

// RFC 7946 asks for counterclockwise outer rings, so a clockwise ring is reversed.
function lonLatRing(tile, ring, pixels) {
  const lonLat = ring.map((point) => pixelToLonLat(tile, point, pixels));
  return signedRingArea(lonLat) < 0 ? lonLat.toReversed() : lonLat;
}

const OUTPUTS = {
  segment: { dataset: "segmentation", feature: "outline" },
  obb: { dataset: "oriented bounding box (OBB)", feature: "rotated box" },
};

// Rotated boxes need each object's `corners`, which the page works out with a convex hull.
function pixelRing({ outline, corners }, mode) {
  return mode === "segment" ? outline : [...corners, corners[0]];
}

// The properties every feature of labels.geojson carries, so an attribute can't take one of their names.
export const LABEL_PROPERTIES = ["tile_id", "image", "object_name", "output", "source", "marked_cells", "imagery_url"];

export function labelsGeojson(tiles, objects, { mode, objectName, attribute, pixels }) {
  const features = tiles.flatMap((tile) =>
    (objects.get(tile.id) ?? []).map((object) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [lonLatRing(tile, pixelRing(object, mode), pixels)] },
      properties: { tile_id: tile.id, image: `images/${tile.id}.jpg`, object_name: objectName, ...(attribute && { [attribute]: object.value }), output: OUTPUTS[mode].feature, source: object.source, marked_cells: tile.cells.length, imagery_url: tile.template },
    })));
  // A Locate project has one tile URL, so it is stated once at the top as well as on each object.
  return { type: "FeatureCollection", imagery_url: tiles[0]?.template, features };
}

export function datasetReadme({ projectName, projectLink, threshold, modelName, mode, objectName, attribute, values, tiles, objectCount, pixels, detailLevels }) {
  const templates = [...new Set(tiles.map((tile) => tile.template))];
  return `# ${projectName}

YOLO ${OUTPUTS[mode].dataset} dataset of "${objectName}", marked with the Locate auto labeller.${attribute ? ` Each object has a \`${attribute}\` value, and each value is one class: ${values.join(", ")}.` : ""}

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
