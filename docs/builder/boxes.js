import { AutoProcessor, EdgeTamModel, RawImage, Tensor, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
import { contours } from "https://cdn.jsdelivr.net/npm/d3-contour@4.0.2/+esm";
import { simplify } from "https://cdn.jsdelivr.net/npm/@turf/simplify@7.4.0/+esm";
import { convex } from "https://cdn.jsdelivr.net/npm/@turf/convex@7.4.0/+esm";
import { bboxClip } from "https://cdn.jsdelivr.net/npm/@turf/bbox-clip@7.4.0/+esm";
import { booleanPointInPolygon } from "https://cdn.jsdelivr.net/npm/@turf/boolean-point-in-polygon@7.4.0/+esm";
import { tiles as coverTiles } from "https://cdn.jsdelivr.net/npm/@mapbox/tile-cover@3.0.2/+esm";
import { EXAMPLE_PROJECT } from "./results-tools.js";
import { loadProject } from "./results-file.js";
import { foldSetup, setStatus } from "./setup-card.js";
import { DRAG_PIXELS, TILE_PIXELS, LABEL_PROPERTIES, areaObjectsKey, areaTiles, attributeValues, boxOutline, cellRectangle, clampedCorners, classIndex, datasetCounts, datasetReadme, datasetYaml, detailTiles, dragBox, isDrag, isOutsideImage, keepsCutLabel, keptTiles, keyAction, labelSettings, labelsGeojson, largestRing, lonLatToPixel, markedAreaEdges, maskBox, obbLabels, objectsWithoutValue, parseTileTemplate, remembered, polygonRings, rectangleFromSide, restoredObjects, rotatedBox, savedObjectsKey, segmentLabels, targetProgress, valueCounts, valueForKey } from "./boxes-tools.js";

// The model runs in a worker, so reading the next tile ahead leaves the page free for taps (https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html).
env.backends.onnx.wasm.proxy = true;

const DETAIL_LEVELS = 2;
const PIXELS = TILE_PIXELS * 2 ** DETAIL_LEVELS;
// One pixel keeps the label files small; on 36 Freetown objects the outline area changed by at most 2%.
const OUTLINE_TOLERANCE = 1;
const TARGET_OBJECTS = 1000;
// One colour per attribute value on the tile; grey marks a label without a listed value.
const VALUE_COLOURS = ["#d73f3f", "#2f7fe0", "#f08c00", "#8e44d6", "#1f9d55", "#e0559c", "#00a3a3", "#8a6d3b"];
const NO_VALUE_COLOUR = "#9aa0a6";

const state = { tiles: [], index: 0, objects: new Map(), images: new Map(), prompts: new Map(), results: null, cleared: null, name: "", projectName: "", projectLink: "", identity: "", threshold: 0, allMapped: false, area: null, storageKey: "", modelId: "", modelName: "", model: null, processor: null, prompt: null, drag: null, side: null, pointer: null, busy: false, value: "" };
const element = (id) => document.getElementById(id);
const tileCanvas = element("tile-canvas");
const boxCanvas = element("box-canvas");

// Image preprocessing and mask post-processing run on the page, so the status is drawn first.
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

function outputMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function orientedCorners(outline) {
  return clampedCorners(rotatedBox(convex({ type: "Polygon", coordinates: [outline] }).geometry.coordinates[0], PIXELS), PIXELS);
}

function shownRing({ outline }) {
  if (outputMode() === "segment") return outline;
  const corners = orientedCorners(outline);
  return [...corners, corners[0]];
}

function strokeRing(context, ring) {
  context.beginPath();
  ring.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
  context.closePath();
  context.stroke();
}

function currentTile() {
  return state.tiles[state.index];
}

function currentObjects() {
  return state.objects.get(currentTile().id) ?? [];
}

function objectCount() {
  const count = currentObjects().length;
  return `${count} ${count === 1 ? "object" : "objects"} on this tile.`;
}

function attributeName() {
  return element("attribute").value.trim();
}

function enteredValues() {
  return attributeName() ? attributeValues(element("attribute-values").value) : [];
}

// A refused value list gives labels no value, since its buttons stay hidden.
function values() {
  const list = enteredValues();
  return valuesProblem(attributeName(), list) ? [] : list;
}

// Labels made while values are listed take the value picked above the tile.
function newValue() {
  return values().length > 0 ? { value: state.value } : {};
}

function labelColour(object) {
  const list = values();
  if (list.length === 0) return VALUE_COLOURS[0];
  return VALUE_COLOURS[list.indexOf(object.value)] ?? NO_VALUE_COLOUR;
}

function countText(objects, list, counts) {
  const target = TARGET_OBJECTS.toLocaleString("en");
  if (list.length === 0) return `${objects.toLocaleString("en")} ${objects === 1 ? "object" : "objects"}, target ${target}`;
  const named = counts.map((count, index) => `${list[index]} ${count.toLocaleString("en")}`);
  const missing = objectsWithoutValue(state.tiles, state.objects, list);
  return `${named.join(", ")}, target ${target} for the most common value${missing > 0 ? `, ${missing.toLocaleString("en")} without a value` : ""}`;
}

function showCounts() {
  const { objects, tilesWithObjects, tiles } = datasetCounts(state.tiles, state.objects);
  const tile = currentTile();
  const list = values();
  const counts = valueCounts(state.tiles, state.objects, list);
  element("dataset-count").textContent = countText(objects, list, counts);
  element("tile-position").textContent = `Tile ${state.index + 1} of ${tiles}, ${tilesWithObjects} ${tilesWithObjects === 1 ? "tile" : "tiles"} labelled`;
  element("tile-id").textContent = state.area ? tile.id : `${tile.id}, ${tile.cells.length} marked ${tile.cells.length === 1 ? "cell" : "cells"}`;
  const { percent, reached } = targetProgress(list.length > 0 ? Math.max(...counts) : objects, TARGET_OBJECTS);
  element("tile-bar-fill").style.width = `${((state.index + 1) / tiles) * 100}%`;
  const bar = element("target-bar");
  bar.style.width = `${percent}%`;
  bar.classList.toggle("reached", reached);
}

// A tile without marked cells shows in full, since dimming it all would hide the objects.
function focusOn() {
  return element("focus").checked && !element("focus").disabled && currentTile()?.cells.length > 0;
}

function showCellsHint() {
  element("cells-hint").hidden = !focusOn();
}

function drawObjects() {
  const context = boxCanvas.getContext("2d");
  context.clearRect(0, 0, PIXELS, PIXELS);
  const tile = currentTile();
  if (focusOn()) {
    context.fillStyle = "rgb(0 0 0 / 0.55)";
    context.fillRect(0, 0, PIXELS, PIXELS);
    for (const cell of tile.cells) {
      const [x1, y1, x2, y2] = cellRectangle(cell, tile.size, PIXELS);
      context.clearRect(x1, y1, x2 - x1, y2 - y1);
    }
    context.lineWidth = 4;
    context.strokeStyle = "#ffd400";
    context.lineCap = "square";
    context.beginPath();
    for (const [[x1, y1], [x2, y2]] of markedAreaEdges(tile.cells, tile.size, PIXELS)) {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    }
    context.stroke();
  }
  context.lineCap = "butt";
  context.setLineDash([12, 8]);
  context.lineWidth = 2;
  context.strokeStyle = "#ffffff";
  if (state.drag?.box) strokeRing(context, boxOutline(state.drag.box));
  const side = state.drag?.side ?? state.side;
  if (side) strokeRing(context, state.side && state.pointer ? rectangleFromSide(...state.side, state.pointer) : side);
  context.setLineDash([]);
  context.lineWidth = 4;
  for (const object of currentObjects()) {
    context.strokeStyle = labelColour(object);
    strokeRing(context, shownRing(object));
  }
  updateControls();
}

// While the model or the network works, every control is off, so no second task starts on top of it.
function updateControls() {
  const loaded = state.tiles.length > 0;
  element("previous").disabled = state.busy || !loaded || state.index === 0;
  element("next").disabled = state.busy || !loaded || state.index === state.tiles.length - 1;
  element("undo").disabled = state.busy || !loaded || (currentObjects().length === 0 && !canRestore());
  element("clear").disabled = state.busy || !loaded || currentObjects().length === 0;
  for (const tool of document.querySelectorAll('input[name="tool"]')) tool.disabled = state.busy || !loaded;
  element("download").disabled = state.busy || !loaded;
  element("download-kind").disabled = state.busy || !loaded;
  element("labels-file").disabled = state.busy || !loaded;
  for (const control of document.querySelectorAll('#setup button, #model, #change, input[name="mode"], input[name="source"], #object-name, #attribute, #attribute-values')) control.disabled = state.busy;
  document.body.classList.toggle("working", state.busy);
}

async function work(task) {
  if (state.busy) return;
  state.busy = true;
  state.drag = null;
  updateControls();
  try {
    await task();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
    updateControls();
  }
}

// Objects stay in this browser per project and share, so loading the same results again continues at the same tile.
function saveObjects() {
  localStorage.setItem(state.storageKey, JSON.stringify({ tile: currentTile().id, objects: Object.fromEntries(state.objects), objectName: element("object-name").value.trim(), attribute: attributeName(), values: element("attribute-values").value }));
}

// Unreadable saved data is removed so the next load starts clean.
function readSaved(key) {
  const text = localStorage.getItem(key);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    localStorage.removeItem(key);
    throw new Error("The saved objects for these results could not be read and were removed. Load again to start without them.");
  }
}

// A sub-tile beyond the image edge stays empty, so tiles on the edge of the imagery still open.
async function loadImage(url) {
  const message = `An imagery tile failed to load: ${url}`;
  const response = await fetch(url).catch((error) => {
    throw new Error(message, { cause: error });
  });
  if (!response.ok) {
    if (isOutsideImage(response.status, await response.text())) return null;
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  return createImageBitmap(await response.blob());
}

function tileImage(tile) {
  return remembered(state.images, tile.id, () => stitchedImage(tile));
}

// The deeper sub-tiles are stitched into one image; it is kept so the download needs no second fetch.
async function stitchedImage(tile) {
  const parts = await Promise.all(detailTiles(tile, DETAIL_LEVELS).map(async (part) => ({ ...part, image: await loadImage(part.url) })));
  const canvas = new OffscreenCanvas(PIXELS, PIXELS);
  const context = canvas.getContext("2d");
  for (const { image, left, top } of parts.filter((part) => part.image)) {
    context.drawImage(image, left, top, TILE_PIXELS, TILE_PIXELS);
    image.close();
  }
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

// Transformers.js runs one model call at a time in the browser, so a tap waits for a read ahead in progress (https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/src/backends/onnx.js).
function tilePrompt(tile) {
  return remembered(state.prompts, tile.id, async () => {
    const inputs = await state.processor(await RawImage.fromBlob(await tileImage(tile)));
    return { inputs, embeddings: await state.model.get_image_embeddings(inputs) };
  });
}

function readAhead(index) {
  const kept = new Set([index - 1, index, index + 1].map((position) => state.tiles[position]?.id));
  for (const id of state.prompts.keys()) if (!kept.has(id)) state.prompts.delete(id);
  const next = state.tiles[index + 1];
  if (next) tilePrompt(next);
}

async function showTile(index) {
  state.index = index;
  state.prompt = null;
  clearSide();
  const tile = currentTile();
  showCounts();
  showCellsHint();
  tileCanvas.getContext("2d").clearRect(0, 0, PIXELS, PIXELS);
  drawObjects();
  setStatus("Loading the imagery...");
  const blob = await tileImage(tile);
  if (!state.objects.has(tile.id)) state.objects.set(tile.id, []);
  saveObjects();
  tileCanvas.getContext("2d").drawImage(await createImageBitmap(blob), 0, 0);
  setStatus(`${state.modelName} is reading the image...`);
  await nextPaint();
  state.prompt = await tilePrompt(tile);
  readAhead(index);
  setStatus(currentObjects().length === 0 ? "Ready. Tap each object to label it." : `Ready. ${objectCount()}`);
}

// A drag is sent as a box with its centre point, which keeps the model on the object the box surrounds.
async function findObject({ point, box }) {
  const { inputs, embeddings } = state.prompt;
  const [scaleY, scaleX] = inputs.reshaped_input_sizes[0].map((size, axis) => size / inputs.original_sizes[0][axis]);
  const prompt = {
    input_points: new Tensor("float32", [point[0] * scaleX, point[1] * scaleY], [1, 1, 1, 2]),
    input_labels: new Tensor("int64", [1n], [1, 1, 1]),
  };
  if (box) prompt.input_boxes = new Tensor("float32", [box[0] * scaleX, box[1] * scaleY, box[2] * scaleX, box[3] * scaleY], [1, 1, 4]);
  const output = await state.model({ ...embeddings, ...prompt });
  const masks = await state.processor.post_process_masks(output.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
  const scores = Array.from(output.iou_scores.data);
  const best = scores.indexOf(Math.max(...scores));
  const [, , height, width] = masks[0].dims;
  const mask = masks[0].data.subarray(best * height * width, (best + 1) * height * width);
  if (!maskBox(mask, width, height)) return null;
  const shape = contours().size([width, height]).smooth(false).thresholds([0.5])(mask)[0];
  const ring = largestRing(shape.coordinates);
  const outline = simplify({ type: "Polygon", coordinates: [ring] }, { tolerance: OUTLINE_TOLERANCE }).coordinates[0];
  return { outline };
}

function imagePoint(event) {
  const rectangle = boxCanvas.getBoundingClientRect();
  return [(event.clientX - rectangle.left) * (PIXELS / rectangle.width), (event.clientY - rectangle.top) * (PIXELS / rectangle.height)];
}

boxCanvas.addEventListener("pointerdown", (event) => {
  if (!state.prompt || state.busy) return;
  boxCanvas.setPointerCapture(event.pointerId);
  state.drag = { start: imagePoint(event), box: null };
});

function drawingRotated() {
  return drawing() && outputMode() === "obb";
}

function isSide(start, end) {
  return Math.hypot(end[0] - start[0], end[1] - start[1]) >= DRAG_PIXELS;
}

function clearSide() {
  state.side = null;
  state.pointer = null;
}

boxCanvas.addEventListener("pointermove", (event) => {
  if (state.side) {
    state.pointer = imagePoint(event);
    drawObjects();
    return;
  }
  if (!state.drag) return;
  const end = imagePoint(event);
  if (drawingRotated() && !state.side) {
    state.drag.side = isSide(state.drag.start, end) ? [state.drag.start, end] : null;
  } else {
    state.drag.box = isDrag(state.drag.start, end) ? dragBox(state.drag.start, end, PIXELS) : null;
  }
  drawObjects();
});

// A rotated box is drawn in two steps: a drag along one side of the object, then a tap on the opposite side.
function drawRotated(start, end) {
  if (!state.side) {
    if (isSide(start, end)) state.side = [start, end];
    drawObjects();
    setStatus(state.side ? "Tap the opposite side of the object." : "Drag along one side of the object.");
    return;
  }
  const rectangle = rectangleFromSide(...state.side, end);
  clearSide();
  if (!isSide(rectangle[0], rectangle[1]) || !isSide(rectangle[1], rectangle[2])) {
    drawObjects();
    setStatus("That box doesn't have a width. Drag along one side of the object, then tap the opposite side.");
    return;
  }
  const outline = bboxClip({ type: "Polygon", coordinates: [rectangle] }, [0, 0, PIXELS, PIXELS]).geometry.coordinates[0];
  if (!outline) {
    drawObjects();
    setStatus("That box is outside the tile. Draw it on the tile.");
    return;
  }
  currentObjects().push({ outline, source: "drawn by hand", ...newValue() });
  afterChange(`Drawn by hand. ${objectCount()}`);
}

// With values listed, a tap on a label gives it the picked value, so a wrong value is fixed without drawing again.
function labelAt(point) {
  return currentObjects().findLast((object) => booleanPointInPolygon(point, { type: "Polygon", coordinates: [shownRing(object)] }));
}

boxCanvas.addEventListener("pointerup", (event) => {
  if (!state.drag || state.busy) {
    state.drag = null;
    return;
  }
  const { start } = state.drag;
  state.drag = null;
  const end = imagePoint(event);
  if (drawingRotated() && (state.side || isSide(start, end))) {
    drawRotated(start, end);
    return;
  }
  const box = isDrag(start, end) ? dragBox(start, end, PIXELS) : null;
  const point = box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : start;
  const objects = currentObjects();
  const tapped = !box && values().length > 0 ? labelAt(start) : undefined;
  if (tapped) {
    tapped.value = state.value;
    afterChange(`Set to ${attributeName()}: ${state.value}. ${objectCount()}`);
    return;
  }
  if (drawing()) {
    if (!box) {
      setStatus(toolHint());
      return;
    }
    objects.push({ outline: boxOutline(box), source: "drawn by hand", ...newValue() });
    afterChange(`Drawn by hand. ${objectCount()}`);
    return;
  }
  const value = newValue();
  work(async () => {
    setStatus(`${state.modelName} is finding the object...`);
    drawObjects();
    await nextPaint();
    const object = await findObject({ point, box });
    if (object) objects.push({ ...object, source: state.modelName, ...value });
    afterChange(object ? objectCount() : "Nothing found there. Drag closer around the object.");
  });
});

function drawing() {
  return document.querySelector('input[name="tool"]:checked').value === "hand";
}

function toolHint() {
  if (!drawing()) return "Model: tap an object, or drag around it.";
  return outputMode() === "obb" ? "Drawing by hand: drag along one side of the object, then tap the opposite side." : "Drawing by hand: drag a box around the object.";
}

for (const tool of document.querySelectorAll('input[name="tool"]')) {
  tool.addEventListener("change", () => {
    clearSide();
    if (state.tiles.length > 0) drawObjects();
    setStatus(toolHint());
  });
}

boxCanvas.addEventListener("pointercancel", () => {
  state.drag = null;
  drawObjects();
});

// A full or blocked storage throws a DOMException; the object stays on the page and the status says it was not saved.
function afterChange(message) {
  drawObjects();
  showCounts();
  try {
    saveObjects();
    setStatus(message);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    setStatus(`${message} The objects could not be saved in this browser: ${error.message}`);
  }
}

function canRestore() {
  return currentObjects().length === 0 && state.cleared?.tileId === currentTile()?.id;
}

element("undo").addEventListener("click", () => {
  if (state.side) {
    clearSide();
    drawObjects();
    return;
  }
  if (canRestore()) {
    currentObjects().push(...state.cleared.objects);
    state.cleared = null;
    afterChange(`Brought back the cleared labels. ${objectCount()}`);
    return;
  }
  currentObjects().pop();
  afterChange(objectCount());
});

element("clear").addEventListener("click", () => {
  const objects = currentObjects();
  state.cleared = { tileId: currentTile().id, objects: objects.splice(0) };
  afterChange(`Cleared the tile. Undo brings the labels back. ${objectCount()}`);
});

function showError(error) {
  console.error(error);
  setStatus(error.message);
}

element("previous").addEventListener("click", () => work(() => showTile(state.index - 1)));
element("next").addEventListener("click", () => work(() => showTile(state.index + 1)));

for (const choice of document.querySelectorAll('input[name="mode"]')) {
  choice.addEventListener("change", () => {
    clearSide();
    if (state.tiles.length > 0) drawObjects();
  });
}

// The model class is fixed, so every option in the Model field is an EdgeTAM checkpoint.
async function loadModel() {
  const choice = element("model").selectedOptions[0];
  if (state.modelId === choice.value) return;
  setStatus(`Loading ${choice.dataset.name} (about ${choice.dataset.size} the first time)...`);
  const [model, processor] = await Promise.all([EdgeTamModel.from_pretrained(choice.value, { dtype: "fp32", device: "wasm" }), AutoProcessor.from_pretrained(choice.value)]);
  Object.assign(state, { modelId: choice.value, modelName: choice.dataset.name, model, processor });
  element("model-link").textContent = choice.dataset.name;
  element("model-link").href = `https://huggingface.co/${choice.value}`;
}

function chosenSource() {
  return document.querySelector('input[name="source"]:checked').value;
}

// A hidden group is also disabled, so its required fields do not block the form.
function showSourceFields() {
  const area = chosenSource() === "area";
  for (const [id, shown] of [["project-source", !area], ["area-source", area]]) {
    element(id).hidden = !shown;
    element(id).disabled = !shown;
  }
}

async function projectSource() {
  const link = element("project-link").value.trim();
  const threshold = Number(element("threshold").value);
  const allMapped = element("all-tiles").checked;
  const imagery = element("imagery-override").value.trim();
  const template = imagery ? parseTileTemplate(imagery) : null;
  // MapSwipe results are fetched once per link; reloading the page fetches them again.
  if (state.results?.link !== link) state.results = { link, ...(await loadProject(link, setStatus)) };
  const { name, fileName, rows } = state.results;
  const listed = keptTiles(rows, threshold, { allMapped });
  const tiles = template ? listed.map((tile) => ({ ...tile, template })) : listed;
  if (tiles.length === 0) throw new Error(allMapped ? "None of the tiles in these results has a volunteer answer." : "None of the cells reaches that share of volunteers. Lower the share and load again.");
  return { tiles, link, identity: link, storageKey: savedObjectsKey(rows, threshold, { allMapped }), name: fileName, projectName: name, threshold, allMapped, area: null, summary: `${name}, ${threshold}% share${allMapped ? ", tiles below the share included" : ""}${template ? ", own imagery" : ""}` };
}

async function readArea(file) {
  try {
    const area = JSON.parse(await file.text());
    if (typeof area?.type !== "string" || (area.type === "FeatureCollection" && !Array.isArray(area.features))) throw new Error(`${file.name} is not a GeoJSON object.`);
    return area;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`${file.name} is not valid GeoJSON.`, { cause: error });
  }
}

async function areaSource() {
  const template = parseTileTemplate(element("tile-template").value);
  const zoom = Number(element("area-zoom").value);
  const [file] = element("area-file").files;
  const tiles = areaTiles(await readArea(file), zoom, template, coverTiles);
  const name = file.name.replace(/\.(geo)?json$/i, "");
  const storageKey = areaObjectsKey(template, zoom, file.name);
  return { tiles, link: "", identity: storageKey, storageKey, name, projectName: name, threshold: null, allMapped: false, area: file.name, summary: `${file.name}, zoom ${zoom}` };
}

async function load() {
  const source = chosenSource() === "area" ? await areaSource() : await projectSource();
  const { tiles, storageKey } = source;
  const saved = readSaved(storageKey);
  const restored = restoredObjects(saved, tiles);
  const settings = labelSettings(enteredSettings(source.identity), saved);
  const objectName = settings.objectName || (source.identity === EXAMPLE_PROJECT ? "solar panel" : "");
  await loadModel();
  state.tiles = tiles;
  state.images = new Map();
  state.prompts = new Map();
  state.cleared = null;
  state.name = source.name;
  state.projectName = source.projectName;
  state.projectLink = source.link;
  state.identity = source.identity;
  state.threshold = source.threshold;
  state.area = source.area;
  state.allMapped = source.allMapped;
  state.storageKey = storageKey;
  state.objects = restored.objects;
  element("focus").disabled = source.area !== null;
  element("focus-choice").hidden = source.area !== null;
  foldSetup(source.summary);
  element("stage-area").scrollIntoView({ block: "start" });
  element("object-name").value = objectName;
  element("attribute").value = settings.attribute;
  element("attribute-values").value = settings.values;
  showValueChoices();
  await showTile(restored.index);
}

element("setup").addEventListener("submit", (event) => {
  event.preventDefault();
  work(load);
});

element("example").addEventListener("click", () => {
  document.querySelector('input[name="source"][value="project"]').checked = true;
  showSourceFields();
  element("project-link").value = EXAMPLE_PROJECT;
  element("setup").requestSubmit();
});

// Only tiles with an object go in the dataset, so skipping past a tile never adds it as an image without objects.
async function download() {
  const kind = element("download-kind").value;
  if (kind === "images") {
    await downloadImages();
    return;
  }
  const objectName = element("object-name").value.trim();
  if (!objectName) {
    setStatus("Enter the object name under Change.");
    return;
  }
  const tiles = state.tiles.filter((tile) => state.objects.get(tile.id)?.length > 0);
  if (tiles.length === 0) {
    setStatus("Mark at least one object before downloading.");
    return;
  }
  const attribute = attributeName();
  const problem = valuesProblem(attribute, enteredValues()) ?? valueLabelsProblem(tiles);
  if (problem) {
    setStatus(problem);
    return;
  }
  const list = values();
  const mode = outputMode();
  const shaped = mode === "obb" ? new Map(tiles.map((tile) => [tile.id, state.objects.get(tile.id).map((object) => ({ ...object, corners: orientedCorners(object.outline) }))])) : state.objects;
  const geojson = JSON.stringify(labelsGeojson(tiles, shaped, { mode, objectName, attribute, pixels: PIXELS }));
  if (kind === "labels") {
    saveBlob(new Blob([geojson], { type: "application/geo+json" }), outputName(`labels_${mode}`, "geojson"));
    setStatus(`Downloaded the labels of ${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"}.`);
    return;
  }
  const zip = new JSZip();
  for (const [index, tile] of tiles.entries()) {
    setStatus(`Preparing image ${index + 1} of ${tiles.length}...`);
    const objects = shaped.get(tile.id);
    zip.file(`images/${tile.id}.jpg`, await tileImage(tile));
    const labels = mode === "segment" ? segmentLabels(objects.map((object) => ({ classIndex: classIndex(object, list), outline: object.outline })), PIXELS) : obbLabels(objects.map((object) => ({ classIndex: classIndex(object, list), corners: object.corners })), PIXELS);
    zip.file(`labels/${tile.id}.txt`, labels);
  }
  zip.file("data.yaml", datasetYaml(list.length > 0 ? list : [objectName]));
  zip.file("labels.geojson", geojson);
  const objectCount = datasetCounts(tiles, state.objects).objects;
  zip.file("README.md", datasetReadme({ projectName: state.projectName, projectLink: state.projectLink, threshold: state.threshold, allMapped: state.allMapped, area: state.area, modelName: state.modelName, mode, objectName, attribute, values: list, tiles, objectCount, pixels: PIXELS, detailLevels: DETAIL_LEVELS }));
  await saveZip(zip, outputName(`yolo_${mode}`, "zip"));
  setStatus(`Downloaded ${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"} with objects.`);
}

function outputName(kind, extension) {
  return state.threshold === null ? `${state.name}_${kind}.${extension}` : `${state.name}_${kind}_${state.threshold}.${extension}`;
}

async function saveZip(zip, fileName) {
  saveBlob(await zip.generateAsync({ type: "blob" }, ({ percent }) => setStatus(`Packing ${fileName}, ${Math.floor(percent)}%...`)), fileName);
}

function saveBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Every listed tile goes in, so the images can be labelled in another tool.
async function downloadImages() {
  const zip = new JSZip();
  for (const [index, tile] of state.tiles.entries()) {
    setStatus(`Preparing image ${index + 1} of ${state.tiles.length}...`);
    zip.file(`images/${tile.id}.jpg`, await tileImage(tile));
  }
  await saveZip(zip, outputName("images", "zip"));
  setStatus(`Downloaded ${state.tiles.length} tile images.`);
}

// Each ring is cut to every listed tile it crosses, so a shape across two tiles becomes one object on each.
async function loadLabels(file) {
  const { shapes, skipped } = polygonRings(JSON.parse(await file.text()));
  if (shapes.length === 0) throw new Error(`${file.name} needs at least one polygon.`);
  const attribute = attributeName();
  for (const [id, objects] of state.objects) state.objects.set(id, objects.filter((object) => object.source !== file.name));
  let count = 0;
  for (const tile of state.tiles) {
    for (const { ring, properties } of shapes) {
      const pixelRing = ring.map((point) => lonLatToPixel(tile, point, PIXELS));
      const outline = bboxClip({ type: "Polygon", coordinates: [pixelRing] }, [0, 0, PIXELS, PIXELS]).geometry.coordinates[0];
      if (!outline || !keepsCutLabel(outline, pixelRing)) continue;
      const value = attribute && properties[attribute] != null ? { value: String(properties[attribute]) } : {};
      state.objects.set(tile.id, [...(state.objects.get(tile.id) ?? []), { outline, source: file.name, ...value }]);
      count += 1;
    }
  }
  const leftOut = skipped > 0 ? ` ${skipped} features without a polygon were left out.` : "";
  afterChange(`Loaded ${count} objects from ${file.name} onto the listed tiles.${leftOut} ${objectCount()}`);
}

function valuesProblem(attribute, list) {
  if (LABEL_PROPERTIES.includes(attribute)) return `Each label already has ${attribute}. Enter another attribute name.`;
  if (attribute && list.length === 0) return `Enter the values for ${attribute}, separated by commas.`;
  if (list.length > VALUE_COLOURS.length) return `Enter up to ${VALUE_COLOURS.length} values.`;
  return null;
}

// Every label needs a listed value once values are set, and a label with a value needs the attribute it belongs to.
function valueLabelsProblem(tiles) {
  const list = values();
  const labels = tiles.flatMap((tile) => state.objects.get(tile.id));
  if (list.length === 0) {
    const valued = labels.filter((object) => object.value !== undefined).length;
    return valued > 0 ? `${valued} ${valued === 1 ? "label has" : "labels have"} a value. Enter the attribute and its values before downloading.` : null;
  }
  const missing = objectsWithoutValue(tiles, state.objects, list);
  return missing > 0 ? `${missing} ${missing === 1 ? "label doesn't" : "labels don't"} have a ${attributeName()} value. They are grey on the tiles: click a value, then tap each one.` : null;
}

function valueChoice(value, index) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const key = String(index + 1);
  Object.assign(input, { type: "radio", name: "value", value, checked: value === state.value });
  input.setAttribute("aria-keyshortcuts", key);
  input.addEventListener("change", () => { state.value = value; });
  const number = document.createElement("kbd");
  number.textContent = key;
  number.setAttribute("aria-hidden", "true");
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.background = VALUE_COLOURS[index];
  label.append(input, number, swatch, value);
  return label;
}

// The value is read at each tap, so a value picked while the model runs applies to the next object.
function pickValue(value) {
  state.value = value;
  element("value-choices").querySelector(`input[value="${CSS.escape(value)}"]`).checked = true;
  if (!state.busy) setStatus(`Picked ${attributeName()}: ${value}.`);
}

// A shortcut clicks its control, so a disabled control ignores it; arrow keys on a focused choice keep moving between its options.
document.addEventListener("keydown", (event) => {
  const { classList } = document.body;
  if (!classList.contains("loaded") || classList.contains("editing")) return;
  if (event.target.closest('input:not([type="radio"]):not([type="checkbox"]), select, textarea')) return;
  const action = keyAction(event.key, event);
  if (action && !(event.target.matches('input[type="radio"]') && (action === "previous" || action === "next"))) {
    event.preventDefault();
    if (action === "undo" && event.repeat) return;
    const control = action === "tool" ? document.querySelector('input[name="tool"]:not(:checked)') : element(action);
    control.click();
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const value = valueForKey(event.key, values());
  if (value !== null) pickValue(value);
});

function showValueChoices() {
  const list = values();
  const choices = element("value-choices");
  choices.hidden = list.length === 0;
  element("values-hint").hidden = list.length === 0;
  if (!list.includes(state.value)) state.value = list[0] ?? "";
  const legend = document.createElement("legend");
  legend.textContent = attributeName();
  const shown = document.createElement("span");
  shown.className = "attribute-name";
  shown.textContent = attributeName();
  shown.setAttribute("aria-hidden", "true");
  choices.replaceChildren(legend, shown, ...list.map(valueChoice));
}

function changeValues() {
  showValueChoices();
  if (state.tiles.length === 0) return;
  saveObjects();
  drawObjects();
  showCounts();
  setStatus(valuesProblem(attributeName(), enteredValues()) ?? objectCount());
}

function fieldSettings() {
  return { objectName: element("object-name").value.trim(), attribute: attributeName(), values: element("attribute-values").value };
}

// For other tiles, a field left as it was when Change opened counts as empty, so their saved settings fill it.
function enteredSettings(identity) {
  const entered = fieldSettings();
  if (!state.identity || identity === state.identity) return entered;
  return Object.fromEntries(Object.entries(entered).map(([key, value]) => [key, value === state.openedSettings[key] ? "" : value]));
}

element("change").addEventListener("click", () => {
  state.openedSettings = fieldSettings();
});
element("object-name").addEventListener("input", () => {
  if (state.tiles.length > 0) saveObjects();
});
element("attribute").addEventListener("input", changeValues);
element("attribute-values").addEventListener("input", changeValues);
element("download").addEventListener("click", () => work(download));
for (const choice of document.querySelectorAll('input[name="source"]')) choice.addEventListener("change", showSourceFields);
element("focus").addEventListener("change", () => {
  showCellsHint();
  if (state.tiles.length > 0) drawObjects();
});
element("labels-file").addEventListener("change", (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (file) {
    state.cleared = null;
    work(() => loadLabels(file));
  }
});
