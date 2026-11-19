import { tileAt } from "./area-tools.js";
import { imageryTemplate, passesThreshold, subGridSize, tileFractionToLonLat } from "./results-tools.js";

export const TILE_PIXELS = 256;

// A movement smaller than this across or down, in image pixels, is a tap; a larger one is a drag sent to the model as a box.
export const DRAG_PIXELS = 6;

// `mapped` holds the tiles with at least one volunteer answer.
export function projectTiles(rows, thresholdPercent) {
  const size = subGridSize(rows);
  const tiles = new Map();
  const mapped = new Set();
  for (const row of rows) {
    if (!tiles.has(row.task_id)) {
      tiles.set(row.task_id, { id: row.task_id, x: row.tile_x, y: row.tile_y, zoom: row.tile_z, template: imageryTemplate(row), size, cells: [] });
    }
    if (row.total_count > 0) mapped.add(row.task_id);
    if (passesThreshold(row, thresholdPercent)) tiles.get(row.task_id).cells.push(row.task_partition_index);
  }
  return { tiles: [...tiles.values()].map((tile) => ({ ...tile, cells: tile.cells.toSorted((a, b) => a - b) })), mapped };
}

export function keptTiles(rows, thresholdPercent, { allMapped = false } = {}) {
  const { tiles, mapped } = projectTiles(rows, thresholdPercent);
  const listed = tiles.filter((tile) => tile.cells.length > 0 || (allMapped && mapped.has(tile.id)));
  return listed.toSorted((a, b) => Number(b.cells.length > 0) - Number(a.cells.length > 0));
}

// Tiles opened from the review map are added to the list, so on a reload every tile with saved labels or marked done, and the last tile open, are listed again.
export function withSavedTiles(listed, all, saved) {
  const ids = new Set(listed.map((tile) => tile.id));
  const wanted = (tile) => !ids.has(tile.id) && ((saved?.objects?.[tile.id]?.length ?? 0) > 0 || tile.id === saved?.tile || (saved?.done ?? []).includes(tile.id));
  return [...listed, ...all.filter(wanted)];
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

// One key per project, whatever the share or tile choice, so changing either keeps the labels and settings.
export function savedObjectsKey(rows) {
  const project = rows[0]?.project_internal_id;
  if (project === undefined || project === null) throw new Error("The results have no project_internal_id column, so the objects cannot be saved for this project.");
  return `box-helper-objects:${project}`;
}

// Earlier saves sat in localStorage under the same key, with the share and tile choice added after a colon.
export function legacyKeys(keys, key) {
  return keys.filter((stored) => stored === key || stored.startsWith(`${key}:`));
}

// Earlier saves have no timestamp, so the longest list per tile wins and the largest save gives the settings.
export function mergedSaves(saves) {
  if (saves.length === 0) return null;
  const size = (save) => Object.values(save.objects ?? {}).reduce((sum, list) => sum + list.length, 0);
  const largest = saves.reduce((best, save) => (size(save) > size(best) ? save : best));
  const objects = {};
  for (const save of saves) {
    for (const [id, list] of Object.entries(save.objects ?? {})) if (!(id in objects) || list.length > objects[id].length) objects[id] = list;
  }
  return { ...largest, objects, done: [...new Set(saves.flatMap((save) => save.done ?? []))] };
}

// A promise is kept while it runs, so a tile still being read ahead is read once; a failed one is forgotten, so the next try starts again.
export function remembered(map, key, create) {
  if (!map.has(key)) {
    const value = create();
    value.catch(() => {
      if (map.get(key) === value) map.delete(key);
    });
    map.set(key, value);
  }
  return map.get(key);
}

export function areaObjectsKey(template, zoom, fileName) {
  return `box-helper-objects:area:${zoom}:${fileName}:${template}`;
}

export function parseTileTemplate(text) {
  const template = text.trim();
  if (!/^https:\/\//.test(template) || !["{z}", "{x}", "{y}"].every((part) => template.includes(part))) throw new Error("Paste a tile URL that starts with https:// and contains {z}, {x} and {y}.");
  return template;
}

// Each listed tile needs one model run and an imagery request per sub-tile.
export const MAX_AREA_TILES = 5000;
const MAX_BOUNDING_TILES = 100 * MAX_AREA_TILES;

// Covering a huge area tile by tile would freeze the page, so its bounding box is counted first.
function boundingTileCount(ring, zoom) {
  const [west, south, east, north] = ring.reduce(([w, s, e, n], [longitude, latitude]) => [Math.min(w, longitude), Math.min(s, latitude), Math.max(e, longitude), Math.max(n, latitude)], [Infinity, Infinity, -Infinity, -Infinity]);
  const northWest = tileAt(west, north, zoom);
  const southEast = tileAt(east, south, zoom);
  return (southEast.x - northWest.x + 1) * (southEast.y - northWest.y + 1);
}

// `cover` is @mapbox/tile-cover's tiles(); the tiles are named zoom-x-y as MapSwipe names its tasks.
export function areaTiles(geojson, zoom, template, cover) {
  const { shapes } = polygonRings(geojson);
  if (shapes.length === 0) throw new Error("The area file doesn't hold any polygons. Save the area as Polygon or MultiPolygon features in GeoJSON.");
  const tooMany = new Error(`The area covers more than ${MAX_AREA_TILES.toLocaleString("en")} tiles at zoom ${zoom}. Draw a smaller area or choose a lower zoom.`);
  if (shapes.reduce((sum, { ring }) => sum + boundingTileCount(ring, zoom), 0) > MAX_BOUNDING_TILES) throw tooMany;
  const tiles = new Map();
  for (const { ring } of shapes) {
    for (const [x, y] of cover({ type: "Polygon", coordinates: [ring] }, { min_zoom: zoom, max_zoom: zoom })) {
      const id = `${zoom}-${x}-${y}`;
      if (!tiles.has(id)) tiles.set(id, { id, x, y, zoom, template, size: 1, cells: [] });
    }
    if (tiles.size > MAX_AREA_TILES) throw tooMany;
  }
  return [...tiles.values()].toSorted((a, b) => a.y - b.y || a.x - b.x);
}

// Labels on unlisted tiles stay, so a later share that lists them shows them again; the saved tile reopens when listed.
export function restoredObjects(saved, tiles) {
  const objects = new Map(Object.entries(saved?.objects ?? {}));
  return { objects, done: new Set(saved?.done ?? []), index: Math.max(0, tiles.findIndex((tile) => tile.id === saved?.tile)) };
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

// Ctrl or Cmd with Shift and Z is redo in most programs, so it is left alone.
export function keyAction(key, { ctrlKey = false, metaKey = false, altKey = false, shiftKey = false } = {}) {
  if (altKey) return null;
  if (ctrlKey || metaKey) return key.toLowerCase() === "z" && !shiftKey ? "undo" : null;
  return { ArrowLeft: "previous", ArrowRight: "next", z: "undo", Z: "undo", d: "tool", D: "tool", Escape: "review", c: "done-tile", C: "done-tile", "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", 0: "zoom-fit" }[key] ?? null;
}

export function valueSummary(list, counts, target) {
  const top = counts.indexOf(Math.max(...counts));
  return `Most common: ${list[top]}, ${counts[top].toLocaleString("en")}\u00a0of\u00a0${target.toLocaleString("en")}`;
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

function ringBounds(ring) {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Two labels whose bounding boxes overlap by 90% or more of their union count as one.
export function sameLabel(first, second) {
  const [ax1, ay1, ax2, ay2] = ringBounds(first);
  const [bx1, by1, bx2, by2] = ringBounds(second);
  const overlap = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1)) * Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - overlap;
  return union > 0 && overlap / union >= 0.9;
}

// A labels.geojson from this page names its settings at the top, or carries tile_id on every feature and one attribute beside its standard properties; other files give no settings.
// One square per listed tile with its label count and Done mark, since an empty tile marked Done has no label to carry it.
export function tilesGeojson(tiles, objects, done) {
  const { features } = tileGrid(tiles, objects, new Set(), done);
  return { type: "FeatureCollection", features: features.map(({ geometry, properties }) => ({ type: "Feature", geometry, properties: { tile_id: properties.tile_id, labels: objects.get(properties.tile_id)?.length ?? 0, done: properties.done } })) };
}

export function fileSettings(geojson, shapes) {
  if (typeof geojson.object_name === "string") return { objectName: geojson.object_name, attribute: geojson.attribute ?? "", values: (geojson.values ?? []).join(", ") };
  const properties = shapes.map((shape) => shape.properties);
  if (properties.length === 0 || !properties.every((entry) => typeof entry.tile_id === "string")) return { objectName: "", attribute: "", values: "" };
  const objectName = properties.find((entry) => typeof entry.object_name === "string")?.object_name ?? "";
  const attributes = [...new Set(properties.flatMap((entry) => Object.keys(entry).filter((key) => !LABEL_PROPERTIES.includes(key))))];
  if (attributes.length !== 1) return { objectName, attribute: "", values: "" };
  const [attribute] = attributes;
  const values = [...new Set(properties.map((entry) => entry[attribute]).filter((value) => value !== null && value !== undefined).map(String))];
  return { objectName, attribute, values: values.join(", ") };
}

function tileFromId(id) {
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(id ?? "");
  return match && { id, zoom: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
}

// A downloaded file holds each label's outline or its rotated box, so a repeat is matched against both shapes of each label already on the tile; a tile_id at another zoom is from another project and is cut like any other ring.
export function placedLabels({ shapes, tiles, objects, fileName, attribute, pixels, clip, shapesOf }) {
  const listed = new Set(tiles.map((tile) => tile.id));
  const placed = new Map([...objects].map(([id, list]) => [id, list.filter((object) => object.source !== fileName)]));
  const counts = { count: 0, repeated: 0, unlisted: 0 };
  for (const { ring, properties } of shapes) {
    const named = tileFromId(properties.tile_id);
    const ownTile = named?.zoom === tiles[0]?.zoom ? named : null;
    for (const tile of ownTile ? [ownTile] : tiles) {
      const pixelRing = ring.map((point) => lonLatToPixel(tile, point, pixels));
      const outline = clip(pixelRing);
      if (!outline || (!ownTile && !keepsCutLabel(outline, pixelRing))) continue;
      const list = placed.get(tile.id) ?? [];
      if (ownTile && list.some((object) => shapesOf(object).some((shape) => sameLabel(shape, outline)))) {
        counts.repeated += 1;
        continue;
      }
      const value = attribute && properties[attribute] != null ? { value: String(properties[attribute]) } : {};
      placed.set(tile.id, [...list, { outline, source: fileName, ...value }]);
      counts.count += 1;
      if (!listed.has(tile.id)) counts.unlisted += 1;
    }
  }
  return { objects: placed, ...counts };
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

// The smallest rectangle around a convex ring has a side along a ring edge (Freeman and Shapira, 1975); the smallest one inside the image wins.
export function rotatedBox(hull, pixels = Infinity) {
  const fits = (corners) => corners.flat().every((value) => value >= -0.5 && value <= pixels + 0.5);
  let best = null;
  let bestInside = null;
  for (let index = 0; index < hull.length - 1; index++) {
    const [[x1, y1], [x2, y2]] = [hull[index], hull[index + 1]];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length === 0) continue;
    const [alongX, alongY] = [(x2 - x1) / length, (y2 - y1) / length];
    const along = hull.map(([x, y]) => x * alongX + y * alongY);
    const across = hull.map(([x, y]) => y * alongX - x * alongY);
    const [start, end, near, far] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
    const area = (end - start) * (far - near);
    const corners = [[start, near], [end, near], [end, far], [start, far]].map(([a, c]) => [a * alongX - c * alongY, a * alongY + c * alongX]);
    if (!best || area < best.area) best = { area, corners };
    if (fits(corners) && (!bestInside || area < bestInside.area)) bestInside = { area, corners };
  }
  return (bestInside ?? best).corners;
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

export function labelsGeojson(tiles, objects, { mode, objectName, attribute, values = [], pixels }) {
  const features = tiles.flatMap((tile) =>
    (objects.get(tile.id) ?? []).map((object) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [lonLatRing(tile, pixelRing(object, mode), pixels)] },
      properties: { tile_id: tile.id, image: `images/${tile.id}.jpg`, object_name: objectName, ...(attribute && { [attribute]: object.value }), output: OUTPUTS[mode].feature, source: object.source, marked_cells: tile.cells.length, imagery_url: tile.template },
    })));
  // A Locate project has one tile URL, so it is stated once at the top as well as on each object; the full value list keeps values that no label uses yet.
  return { type: "FeatureCollection", imagery_url: tiles[0]?.template, object_name: objectName, ...(attribute && { attribute, values }), features };
}

export function datasetReadme({ projectName, projectLink, threshold, allMapped, area, modelName, mode, objectName, attribute, values, tiles, objectCount, pixels, detailLevels }) {
  const templates = [...new Set(tiles.map((tile) => tile.template))];
  return `# ${projectName}

YOLO ${OUTPUTS[mode].dataset} dataset of "${objectName}", marked with the Locate auto labeller.${attribute ? ` Each object has a \`${attribute}\` value, and each value is one class: ${values.join(", ")}.` : ""}

${area ? `- Area: ${area}, zoom ${tiles[0].zoom}` : `- Project: ${projectLink}\n- Volunteer share: ${threshold}%${allMapped ? ", tiles below the share included" : ""}`}
- Model: ${modelName}
- Images: ${tiles.length}, objects: ${objectCount}

## Files

- \`images/\`: one ${pixels} x ${pixels} JPEG per tile, named by tile ID (zoom-x-y).
- \`labels/\`: one YOLO label file per image.
- \`data.yaml\`: the dataset file for Ultralytics.
- \`labels.geojson\`: every object as a polygon in longitude and latitude (EPSG:4326), with its tile, source and imagery.
- \`tiles.geojson\`: every listed tile as a square, with its number of labels and \`done\` (true when the tile was marked Done).

## Open in QGIS

1. In the **Browser** panel, right-click **XYZ Tiles** and choose **New Connection**. Enter a **Name**, paste ${templates.length === 1 ? "this URL" : "one of these URLs"} into **URL**, tick **Max. Zoom Level** and set it to ${tiles[0].zoom + detailLevels}, and click **OK**.

${templates.map((template) => `   \`\`\`text\n   ${template}\n   \`\`\``).join("\n\n")}

2. Expand **XYZ Tiles** and double-click the new connection to add the imagery to the map.
3. Drag \`labels.geojson\` into QGIS. It draws above the imagery.
`;
}

export function tileGrid(tiles, objects, listed, done = new Set()) {
  const features = tiles.map((tile, index) => {
    const corners = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]].map((corner) => pixelToLonLat(tile, corner, 1));
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [corners] }, properties: { index, tile_id: tile.id, listed: listed.has(tile.id), labelled: (objects.get(tile.id)?.length ?? 0) > 0, done: done.has(tile.id) } };
  });
  return { type: "FeatureCollection", features };
}
