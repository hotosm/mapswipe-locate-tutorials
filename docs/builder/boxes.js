import { AutoProcessor, EdgeTamModel, RawImage, Tensor, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
import { contours } from "https://cdn.jsdelivr.net/npm/d3-contour@4.0.2/+esm";
import { simplify } from "https://cdn.jsdelivr.net/npm/@turf/simplify@7.4.0/+esm";
import { convex } from "https://cdn.jsdelivr.net/npm/@turf/convex@7.4.0/+esm";
import { bboxClip } from "https://cdn.jsdelivr.net/npm/@turf/bbox-clip@7.4.0/+esm";
import { booleanPointInPolygon } from "https://cdn.jsdelivr.net/npm/@turf/boolean-point-in-polygon@7.4.0/+esm";
import { tiles as coverTiles } from "https://cdn.jsdelivr.net/npm/@mapbox/tile-cover@3.0.2/+esm";
import { del as deleteSaved, entries as savedEntries, get as getSaved, set as putSaved } from "https://cdn.jsdelivr.net/npm/idb-keyval@6.3.0/+esm";
import { EXAMPLE_PROJECT } from "./results-tools.js";
import { loadProject } from "./results-file.js";
import { foldSetup, setStatus } from "./setup-card.js";
import { createTileMap } from "./boxes-map.js";
import { createTileZoom } from "./boxes-zoom.js";
import { DRAG_PIXELS, HAND_DRAWN, TILE_PIXELS, LABEL_PROPERTIES, areaObjectsKey, areaTiles, attributeValues, boxOutline, cellRectangle, clampedCorners, datasetCounts, detailTiles, detailImage, dragBox, isDrag, isOutsideImage, keepsDrawnShape, keptTiles, keyAction, projectTiles, withSavedTiles, tilesFileViewed, tilesGeojson, ringOnTiles, fileSettings, labelSettings, legacyKeys, mergedSaves, placedLabels, labelsGeojson, largestRing, lonLatToPixel, markedAreaEdges, maskBox, mergedSelection, setStep, agreementEdges, objectsWithoutValue, keptSettings, fileAttribute, parseTileTemplate, renamedValue, renameLabels, remembered, polygonRings, rectangleFromSide, restoredObjects, rotatedBox, savedObjectsKey, targetProgress, tileGrid, valueCounts, valueForKey, valueSummary } from "./boxes-tools.js";

// The model runs in a worker, so reading the next tile ahead leaves the page free for taps (https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html).
env.backends.onnx.wasm.proxy = true;

const DETAIL_LEVELS = 2;
const PIXELS = TILE_PIXELS * 2 ** DETAIL_LEVELS;
// Two class buttons share a row in the side panel only while each name fits on about one line.
const LONG_VALUE = 10;
const clipToTile = (ring) => bboxClip({ type: "Polygon", coordinates: [ring] }, [0, 0, PIXELS, PIXELS]).geometry.coordinates[0];
// One pixel keeps the label files small; on 36 Freetown objects the outline area changed by at most 2%.
const OUTLINE_TOLERANCE = 1;
const TARGET_OBJECTS = 1000;
// One colour per attribute value on the tile; grey marks a label without a listed value.
const VALUE_COLOURS = ["#d73f3f", "#2f7fe0", "#f08c00", "#8e44d6", "#1f9d55", "#e0559c", "#00a3a3", "#8a6d3b"];
const NO_VALUE_COLOUR = "#9aa0a6";

const state = { tiles: [], allTiles: [], index: 0, objects: new Map(), viewed: new Set(), images: new Map(), prompts: new Map(), results: null, cleared: null, name: "", projectName: "", identity: "", threshold: 0, allMapped: false, area: null, storageKey: "", claimedKey: "", releaseTab: null, source: null, saving: null, saveWanted: false, modelId: "", modelName: "", model: null, processor: null, prompt: null, drag: null, side: null, pointer: null, busy: false, value: "", open: false, map: null, zoom: 1, mapEdit: false, mapSide: false, picked: [], tileSet: [], mapUndo: [], mapVersion: 0, committedValues: [], committedPick: "" };
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

function closedRing(corners) {
  return [...corners, corners[0]];
}

function shownRing(object) {
  return outputMode() === "segment" || keepsDrawnShape(object) ? object.outline : closedRing(orientedCorners(object.outline));
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
  if (list.length > 0 && Math.max(...counts) > 0) return valueSummary(list, counts, TARGET_OBJECTS);
  return `${objects.toLocaleString("en")} ${objects === 1 ? "object" : "objects"}, target ${TARGET_OBJECTS.toLocaleString("en")}`;
}

function showValueTable(list, counts) {
  const table = element("value-counts");
  table.hidden = list.length === 0;
  if (table.hidden) return;
  const missing = objectsWithoutValue(state.tiles, state.objects, list);
  const rows = list.map((value, index) => [value, counts[index], VALUE_COLOURS[index]]);
  if (missing > 0) rows.push(["Without a value", missing, NO_VALUE_COLOUR]);
  table.tBodies[0].replaceChildren(...rows.map(([name, count, colour]) => {
    const row = document.createElement("tr");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colour;
    const label = document.createElement("span");
    label.className = "value-name";
    label.append(swatch, name);
    row.insertCell().append(label);
    row.insertCell().textContent = count.toLocaleString("en");
    const track = document.createElement("span");
    track.className = "value-track";
    const fill = document.createElement("span");
    fill.style.width = count > 0 ? `max(2px, ${targetProgress(count, TARGET_OBJECTS).percent}%)` : "0";
    fill.style.background = colour;
    track.append(fill);
    row.insertCell().append(track);
    return row;
  }));
}

function showCounts() {
  const { objects, tilesWithObjects, tiles } = datasetCounts(state.tiles, state.objects);
  const tile = currentTile();
  const list = values();
  const counts = valueCounts(state.tiles, state.objects, list);
  element("dataset-count").textContent = countText(objects, list, counts);
  showValueTable(list, counts);
  element("tile-number").value = state.index + 1;
  element("tile-number").max = tiles;
  const viewed = state.tiles.filter((listed) => state.viewed.has(listed.id)).length;
  const set = new Set(state.tileSet);
  const inSet = set.size === 0 ? "" : set.has(tile.id) ? `, picked tile ${state.tiles.filter((listed, index) => index <= state.index && set.has(listed.id)).length} of ${set.size}` : `, ${set.size} picked`;
  element("tile-total").textContent = `${tiles}, ${tilesWithObjects} labelled, ${viewed} viewed${inSet}`;
  element("tile-position").title = state.area ? tile.id : `${tile.id}, ${tile.cells.length} marked ${tile.cells.length === 1 ? "cell" : "cells"}`;
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
    context.lineWidth = 4 / state.zoom;
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
  context.setLineDash([12 / state.zoom, 8 / state.zoom]);
  context.lineWidth = 2 / state.zoom;
  context.strokeStyle = "#ffffff";
  if (state.drag?.box) strokeRing(context, boxOutline(state.drag.box));
  const side = state.drag?.side ?? state.side;
  if (side) strokeRing(context, state.side && state.pointer ? rectangleFromSide(...state.side, state.pointer) : side);
  context.setLineDash([]);
  context.lineWidth = 4 / state.zoom;
  for (const object of currentObjects()) {
    context.strokeStyle = labelColour(object);
    strokeRing(context, shownRing(object));
  }
  updateControls();
}

// While the model or the network works, every control is off, so no second task starts on top of it.
function updateControls() {
  const loaded = state.tiles.length > 0;
  element("previous").disabled = state.busy || !loaded || !state.open || neighbour(-1) === null;
  element("next").disabled = state.busy || !loaded || !state.open || neighbour(1) === null;
  element("map-edit").disabled = state.busy || !loaded || state.open || !state.map;
  element("map-edit").setAttribute("aria-pressed", String(state.mapEdit));
  element("map-edit").classList.toggle("secondary", !state.mapEdit);
  element("map-delete").disabled = state.busy || !state.mapEdit || state.picked.length === 0;
  element("map-clear").hidden = state.open || (state.mapEdit ? state.picked.length === 0 : state.tileSet.length === 0);
  element("undo").disabled = state.mapEdit ? state.busy || (state.mapUndo.length === 0 && !state.mapSide) : state.busy || !loaded || !state.open || (!state.side && currentObjects().length === 0 && !canRestore());
  element("clear").disabled = state.busy || !loaded || !state.open || currentObjects().length === 0;
  for (const tool of document.querySelectorAll('input[name="tool"]')) tool.disabled = state.busy || !loaded;
  element("download").disabled = state.busy || !loaded;
  element("download-anyway").disabled = element("download").disabled;
  element("download-kind").disabled = state.busy || !loaded;
  element("labels-file").disabled = state.busy || !loaded;
  element("tile-number").disabled = state.busy || !loaded || !state.open;
  for (const id of ["zoom-in", "zoom-out", "zoom-fit"]) element(id).disabled = !state.open;
  for (const view of document.querySelectorAll('input[name="view"]')) view.disabled = state.busy || !loaded;
  document.querySelector(`input[name="view"][value="${state.open ? "label" : "review"}"]`).checked = true;
  for (const control of document.querySelectorAll('#setup button, #model, #change, input[name="mode"], input[name="source"], #object-name, #attribute, #attribute-values')) control.disabled = state.busy;
  document.body.classList.toggle("working", state.busy);
  document.body.classList.toggle("tile-open", state.open);
  document.body.classList.toggle("map-editing", state.mapEdit);
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

function savedRecord() {
  return { name: state.projectName, source: state.source, savedAt: Date.now(), tile: currentTile().id, objects: Object.fromEntries(state.objects), viewed: [...state.viewed], ...fieldSettings() };
}

function saveObjects() {
  clearDownloadNote();
  state.saveWanted = true;
  state.saving ??= writeSaves().catch(showError).finally(() => { state.saving = null; });
}

// IndexedDB rejects with a DOMException when the storage is full or blocked, and idb-keyval passes on a null transaction error when a write is aborted (https://cdn.jsdelivr.net/npm/idb-keyval@6.3.0/dist/index.js); the banner stays until a later save succeeds.
async function writeSaves() {
  while (state.saveWanted) {
    state.saveWanted = false;
    try {
      await putSaved(state.storageKey, savedRecord());
    } catch (error) {
      if (error !== null && !(error instanceof DOMException)) throw error;
      element("save-problem").textContent = `The labels could not be saved in this browser (${error?.message ? error.message.replace(/\.$/, "") : "the browser stopped the save"}). Download Labels (GeoJSON) to keep them.`;
      element("save-problem").hidden = false;
      element("saved-at").textContent = "";
      return;
    }
    element("save-problem").hidden = true;
    element("saved-at").textContent = `Saved in this browser at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  }
}

// Persistent storage is cleared only by the person; Firefox asks first, so the load doesn't wait (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
function keepStorage() {
  navigator.storage.persist().catch(showError);
}

// Each project is open in one tab at a time, since every save writes the whole project and the last one would win (https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
function heldLock(key) {
  return new Promise((resolve, reject) => {
    navigator.locks.request(key, { ifAvailable: true }, (lock) => (lock ? new Promise((done) => resolve(done)) : resolve(null))).catch(reject);
  });
}

// The new lock replaces the old one only once the new project is loaded, so a failed load leaves the open project locked.
async function claimTab(key) {
  if (state.claimedKey === key) return null;
  const release = await heldLock(key);
  if (!release) throw new Error("This project or area is open in another tab. Close that tab, then try again here.");
  return release;
}

function keepClaim(key, release) {
  if (!release) return;
  state.releaseTab?.();
  Object.assign(state, { claimedKey: key, releaseTab: release });
}

// Unreadable saved data from localStorage is removed so the next load starts clean.
function readLegacy(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    localStorage.removeItem(key);
    throw new Error("The saved objects for these results could not be read and were removed. Load again to start without them.");
  }
}

async function readSaved(key) {
  return (await getSaved(key)) ?? mergedSaves(legacyKeys(Object.keys(localStorage), key).map(readLegacy));
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
  return remembered(state.images, tile.id, () => tileDetailImage(tile));
}

async function tileDetailImage(tile) {
  const whole = detailImage(tile, DETAIL_LEVELS);
  const pieces = whole.pixels === PIXELS ? [{ url: whole.url, left: 0, top: 0, size: PIXELS }] : detailTiles(tile, DETAIL_LEVELS).map((part) => ({ ...part, size: TILE_PIXELS }));
  const parts = await Promise.all(pieces.map(async (part) => ({ ...part, image: await loadImage(part.url) })));
  const canvas = new OffscreenCanvas(PIXELS, PIXELS);
  const context = canvas.getContext("2d");
  for (const { image, left, top, size } of parts.filter((part) => part.image)) {
    context.drawImage(image, left, top, size, size);
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
  resetZoom();
  const tile = currentTile();
  showCounts();
  tileCanvas.getContext("2d").clearRect(0, 0, PIXELS, PIXELS);
  drawObjects();
  setStatus("Loading the imagery...");
  const blob = await tileImage(tile);
  if (!state.objects.has(tile.id)) state.objects.set(tile.id, []);
  state.viewed.add(tile.id);
  showCounts();
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
  if (!state.prompt || state.busy || event.button !== 0) return;
  boxCanvas.setPointerCapture(event.pointerId);
  state.drag = { start: imagePoint(event), box: null, rotated: drawing() && outputMode() === "obb" };
});

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
  if (state.drag.rotated) {
    state.drag.side = isSide(state.drag.start, end) ? [state.drag.start, end] : null;
  } else {
    state.drag.box = isDrag(state.drag.start, end) ? dragBox(state.drag.start, end, PIXELS) : null;
  }
  drawObjects();
});

// Touch screens have no hover, so the second step also accepts a slide that ends on the opposite side.
function drawRotated(start, end) {
  if (!state.side) {
    state.side = [start, end];
    drawObjects();
    setStatus("Tap the opposite side of the object, or slide to it and lift.");
    return;
  }
  const rectangle = rectangleFromSide(...state.side, end);
  clearSide();
  if (!isSide(rectangle[0], rectangle[1]) || !isSide(rectangle[1], rectangle[2])) {
    drawObjects();
    setStatus("That box doesn't have a width. End farther from the first side.");
    return;
  }
  const outline = clipToTile(rectangle);
  if (!outline) {
    drawObjects();
    setStatus("That box is outside the tile. Draw it on the tile.");
    return;
  }
  currentObjects().push({ outline, source: HAND_DRAWN, ...newValue() });
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
  const { start, rotated } = state.drag;
  state.drag = null;
  const end = imagePoint(event);
  if (state.side || (rotated && isSide(start, end))) {
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
    objects.push({ outline: boxOutline(box), source: HAND_DRAWN, ...newValue() });
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

function afterChange(message) {
  drawObjects();
  showCounts();
  saveObjects();
  setStatus(message);
}

function canRestore() {
  return currentObjects().length === 0 && state.cleared?.tileId === currentTile()?.id;
}

element("undo").addEventListener("click", () => {
  if (state.mapEdit) {
    if (state.map.cancelSide()) return;
    undoMapEdit();
    return;
  }
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
  setStatus(error.message, true);
}

function neighbour(direction) {
  if (state.tileSet.length > 0) return setStep(state.tiles, state.tileSet, state.index, direction);
  const index = state.index + direction;
  return index >= 0 && index < state.tiles.length ? index : null;
}

element("previous").addEventListener("click", () => work(() => showTile(neighbour(-1))));
element("next").addEventListener("click", () => work(() => showTile(neighbour(1))));
element("tile-number").addEventListener("change", (event) => {
  const number = Number(event.target.value);
  if (!Number.isInteger(number) || number < 1 || number > state.tiles.length) {
    event.target.value = state.index + 1;
    setStatus(`Enter a tile number from 1 to ${state.tiles.length}.`, true);
    return;
  }
  clearTileSet();
  if (number - 1 !== state.index) work(() => showTile(number - 1));
});

for (const choice of document.querySelectorAll('input[name="mode"]')) {
  choice.addEventListener("change", () => {
    clearSide();
    if (state.tiles.length > 0) drawObjects();
    if (state.mapEdit) setMapEdit(false);
    refreshMap();
  });
}

// Lines keep their screen width as the tile zooms, so a zoomed label stays thin enough to check its edges.
const tileZoom = createTileZoom(element("stage"), element("tile-view"), (scale) => {
  state.zoom = scale;
  if (state.tiles.length > 0) drawObjects();
});

function resetZoom() {
  tileZoom.reset();
}

element("zoom-in").addEventListener("click", () => tileZoom.zoomIn());
element("zoom-out").addEventListener("click", () => tileZoom.zoomOut());
element("zoom-fit").addEventListener("click", resetZoom);

const REVIEW_HINT = "Click a tile to label it. Shift+click to pick several.";

function labelColours() {
  const list = values();
  if (list.length === 0) return VALUE_COLOURS[0];
  return ["match", ["to-string", ["get", attributeName()]], ...list.flatMap((value, index) => [value, VALUE_COLOURS[index]]), NO_VALUE_COLOUR];
}

function mapView() {
  const tiles = state.tiles.filter((tile) => state.objects.get(tile.id)?.length > 0);
  // The map shows each label's exact shape, so a box split at tile lines shows as drawn.
  const labels = labelsGeojson(tiles, state.objects, { mode: "segment", objectName: "", attribute: attributeName(), pixels: PIXELS });
  numberLabels(labels);
  const all = state.allTiles;
  const listed = new Set(state.tiles.map((tile) => tile.id));
  const picked = new Set(state.tileSet);
  return { key: [state.storageKey, all[0].template, state.threshold, state.allMapped, all.length, all[0].id, all.at(-1).id].join(" "), template: all[0].template, maxzoom: all[0].zoom + DETAIL_LEVELS, grid: tileGrid(all, state.objects, listed, state.viewed), labels, colour: labelColours(), selected: all.findIndex((tile) => tile.id === currentTile().id), set: all.flatMap((tile, index) => (picked.has(tile.id) ? [index] : [])), agreement: state.agreement };
}

function clearSelection() {
  if (state.mapEdit) {
    if (state.picked.length > 0) selectOnMap([], "replace");
    return;
  }
  clearTileSet();
  setStatus(reviewHint());
}

function clearTileSet() {
  state.tileSet = [];
  showCounts();
  updateControls();
  refreshMap();
}

function reviewHint() {
  const count = state.tileSet.length;
  return count === 0 ? REVIEW_HINT : `${count === 1 ? "1 tile" : `${count} tiles`} picked. Open the Label tab to go through them. Esc clears.`;
}

function refreshMap() {
  if (state.map && !state.open && state.tiles.length > 0) state.map.show(mapView()).catch(showError);
}

function pickTile(index) {
  if (state.busy) {
    setStatus("Wait for the labeller to finish, then click the tile again.");
    return;
  }
  if (state.mapEdit) setMapEdit(false);
  state.open = true;
  updateControls();
  element("stage-area").scrollIntoView({ block: "start" });
  if (index !== state.index || !state.prompt) work(() => showTile(index));
  else setStatus(toolHint());
}

// Each feature gets its place in its tile's list, and the map data version, so a click finds the object it shows and a click on older data is ignored.
function numberLabels(labels) {
  state.mapVersion += 1;
  let tileId = null;
  let index = 0;
  for (const { properties } of labels.features) {
    index = properties.tile_id === tileId ? index + 1 : 0;
    tileId = properties.tile_id;
    properties.object_index = index;
    properties.map_version = state.mapVersion;
  }
}

function busyEditing() {
  if (state.busy) setStatus("Wait for the labeller to finish, then edit again.");
  return state.busy;
}

function pickedGeojson() {
  const byTile = new Map();
  for (const { tileId, object } of state.picked) byTile.set(tileId, [...(byTile.get(tileId) ?? []), object]);
  return labelsGeojson(state.allTiles.filter((tile) => byTile.has(tile.id)), byTile, { mode: "segment", objectName: "", pixels: PIXELS });
}

function mapChanged(message) {
  state.tiles = withSavedTiles(state.tiles, state.allTiles, { objects: Object.fromEntries(state.objects) });
  showCounts();
  saveObjects();
  updateControls();
  refreshMap();
  state.map.showPicked(pickedGeojson());
  setStatus(message);
}

function drawOnMap(ring) {
  if (busyEditing()) return;
  if (!ring) {
    setStatus("Zoom in further, then draw again.");
    return;
  }
  if (ring === "thin") {
    setStatus("That box doesn't have a width. Click farther from the first side.");
    return;
  }
  const parts = ringOnTiles(ring, state.allTiles, PIXELS, clipToTile);
  if (parts.length === 0) {
    setStatus("That box is outside the tiles. Draw it over a tile.");
    return;
  }
  const value = newValue();
  const items = parts.map(({ tile, outline }) => {
    const object = { outline, source: HAND_DRAWN, ...value };
    if (!state.objects.has(tile.id)) state.objects.set(tile.id, []);
    state.objects.get(tile.id).push(object);
    return { tileId: tile.id, object };
  });
  state.mapUndo.push({ kind: "add", items });
  state.picked = [];
  mapChanged(parts.length === 1 ? "Drawn by hand." : `Drawn by hand, split into ${parts.length} labels at the tile edges.`);
}

function editHint() {
  return `${outputMode() === "obb" ? "Drag along one side of an object, then click the opposite side." : "Drag to draw a box."} Click a label to select it.`;
}

function sideOnMap(started) {
  state.mapSide = started;
  updateControls();
  setStatus(started ? "Click the opposite side of the object. Esc or Undo cancels." : editHint());
}

// The map can return a label twice when it spans its own data tiles (https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#queryrenderedfeatures), so each label is kept once.
function selectOnMap(found, mode) {
  if (found.some((properties) => properties.map_version !== state.mapVersion)) {
    setStatus("Wait for the map to update, then try again.");
    return;
  }
  const picked = found.map((properties) => ({ tileId: properties.tile_id, object: state.objects.get(properties.tile_id)?.[properties.object_index] })).filter(({ object }) => object);
  state.picked = mergedSelection(state.picked, picked, mode);
  state.map.showPicked(pickedGeojson());
  updateControls();
  if (state.picked.length === 0) setStatus(editHint());
  else {
    const one = state.picked.length === 1;
    setStatus(`${one ? "1 label" : `${state.picked.length} labels`} selected. ${values().length > 0 ? "Press Delete, or pick a value." : "Press Delete to remove."} Esc clears.`);
  }
}

function deleteOnMap() {
  if (busyEditing()) return;
  const items = state.picked.map(({ tileId, object }) => ({ tileId, object, index: state.objects.get(tileId)?.indexOf(object) ?? -1 })).filter(({ index }) => index !== -1);
  if (items.length === 0) {
    state.picked = [];
    state.map.showPicked(pickedGeojson());
    updateControls();
    setStatus("The selected labels are gone. Click a label to select it.");
    return;
  }
  for (const { tileId, object } of items) {
    const list = state.objects.get(tileId);
    const at = list.indexOf(object);
    if (at !== -1) list.splice(at, 1);
  }
  state.mapUndo.push({ kind: "delete", items });
  state.picked = [];
  mapChanged(items.length === 1 ? "Deleted the label." : `Deleted ${items.length} labels.`);
}

function undoMapEdit() {
  const last = state.mapUndo.pop();
  if (!last) return;
  if (last.kind === "add") {
    for (const { tileId, object } of last.items) {
      const list = state.objects.get(tileId) ?? [];
      const at = list.indexOf(object);
      if (at !== -1) list.splice(at, 1);
    }
  }
  if (last.kind === "delete") {
    for (const { tileId, object, index } of last.items.toSorted((a, b) => a.index - b.index)) {
      if (!state.objects.has(tileId)) state.objects.set(tileId, []);
      const list = state.objects.get(tileId);
      if (!list.includes(object)) list.splice(Math.min(index, list.length), 0, object);
    }
  }
  if (last.kind === "value") for (const { object, value } of last.items) object.value = value;
  state.picked = [];
  mapChanged("Undid the last change on the map.");
}

// The map undo history only lives while Edit is on, since labels changed in Label would make its records stale.
function setMapEdit(on) {
  state.mapEdit = on;
  state.mapSide = false;
  state.picked = [];
  state.mapUndo = [];
  state.map?.setEditing(on);
  updateControls();
  setStatus(on ? editHint() : reviewHint());
}

element("map-edit").addEventListener("click", () => setMapEdit(!state.mapEdit));
element("map-delete").addEventListener("click", deleteOnMap);

// A tile of the area that isn't listed yet joins the end of the list, so it counts and downloads like the others.
function pickFromMap(areaIndexes, mode) {
  if (state.busy) {
    setStatus("Wait for the labeller to finish, then click the tile again.");
    return;
  }
  const tiles = [...new Set(areaIndexes)].map((areaIndex) => state.allTiles[areaIndex]);
  const listed = new Set(state.tiles.map((tile) => tile.id));
  state.tiles = [...state.tiles, ...tiles.filter((tile) => !listed.has(tile.id))];
  if (mode === "replace") {
    state.tileSet = [];
    pickTile(state.tiles.findIndex((tile) => tile.id === tiles[0].id));
    return;
  }
  state.tileSet = mergedSelection(state.tileSet, tiles.map((tile) => tile.id), mode, (id) => id);
  showCounts();
  updateControls();
  refreshMap();
  setStatus(reviewHint());
}

function showReview() {
  state.open = false;
  state.drag = null;
  clearSide();
  drawObjects();
  // A failed map is not built again, since a half-built one would stay in the container.
  if (state.map !== false) {
    try {
      state.map ??= createTileMap(element("tile-map"), pickFromMap, { onDraw: drawOnMap, onSelect: selectOnMap, onSide: sideOnMap, rotated: () => outputMode() === "obb" });
    } catch (error) {
      console.error(error);
      state.map = false;
    }
  }
  if (state.map === false) {
    pickTile(state.index);
    showError(new Error("The map didn't load. Check the connection and reload the page to review; you can keep labelling."));
    return;
  }
  updateControls();
  refreshMap();
  element("stage-area").scrollIntoView({ block: "start" });
  setStatus(reviewHint());
}

element("review").addEventListener("change", showReview);
element("label-view").addEventListener("change", () => pickTile(state.tileSet.length === 0 || state.tileSet.includes(currentTile().id) ? state.index : setStep(state.tiles, state.tileSet, -1, 1)));

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
  const ownImagery = (list) => (template ? list.map((tile) => ({ ...tile, template })) : list);
  const tiles = ownImagery(keptTiles(rows, threshold, { allMapped }));
  const allTiles = ownImagery(projectTiles(rows, threshold).tiles);
  if (tiles.length === 0) throw new Error(allMapped ? "None of the tiles in these results has a volunteer answer." : "None of the cells reaches that share of volunteers. Lower the share and load again.");
  return { tiles, allTiles, link, identity: link, storageKey: savedObjectsKey(rows), saved: { kind: "project", link, threshold, allMapped, imagery }, name: fileName, projectName: name, threshold, allMapped, area: null, summary: `${name}, ${threshold}% share${allMapped ? ", tiles below the share included" : ""}${template ? ", own imagery" : ""}` };
}

function readArea(text, file) {
  try {
    const area = JSON.parse(text);
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
  const text = await file.text();
  const tiles = areaTiles(readArea(text, file), zoom, template, coverTiles);
  const name = file.name.replace(/\.(geo)?json$/i, "");
  const storageKey = areaObjectsKey(template, zoom, file.name);
  return { tiles, allTiles: tiles, link: "", identity: storageKey, storageKey, saved: { kind: "area", template, zoom, fileName: file.name }, areaText: text, name, projectName: name, threshold: null, allMapped: false, area: file.name, summary: `${file.name}, zoom ${zoom}` };
}

// Labels that failed to save live only on this page, so another project can't replace them.
async function savedState(source) {
  const { storageKey, areaText, identity } = source;
  await state.saving;
  if (storageKey !== state.storageKey && !element("save-problem").hidden) throw new Error("The last change wasn't saved. Download Labels (GeoJSON) before opening another project or area.");
  const saved = storageKey === state.storageKey ? savedRecord() : await readSaved(storageKey);
  if (areaText !== undefined) await putSaved(`${storageKey}:area`, areaText);
  const tiles = withSavedTiles(source.tiles, source.allTiles, saved);
  return { tiles, restored: restoredObjects(saved, tiles), settings: labelSettings(enteredSettings(identity), saved) };
}

async function load() {
  const source = chosenSource() === "area" ? await areaSource() : await projectSource();
  const { storageKey } = source;
  await loadModel();
  keepStorage();
  const release = await claimTab(storageKey);
  const { tiles, restored, settings } = await savedState(source).catch((error) => {
    release?.();
    throw error;
  });
  const objectName = settings.objectName || (source.identity === EXAMPLE_PROJECT ? "solar panel" : "");
  keepClaim(storageKey, release);
  state.tiles = tiles;
  state.tileSet = [];
  state.allTiles = source.allTiles;
  state.agreement = agreementEdges(source.allTiles);
  state.images = new Map();
  state.prompts = new Map();
  state.cleared = null;
  state.name = source.name;
  state.projectName = source.projectName;
  state.identity = source.identity;
  state.threshold = source.threshold;
  state.area = source.area;
  state.allMapped = source.allMapped;
  state.storageKey = storageKey;
  state.source = source.saved;
  state.objects = restored.objects;
  state.viewed = restored.viewed;
  element("focus").disabled = source.area !== null;
  element("focus-choice").hidden = source.area !== null;
  foldSetup(source.summary);
  element("stage-area").scrollIntoView({ block: "start" });
  element("object-name").value = objectName;
  element("attribute").value = settings.attribute;
  element("attribute-values").value = settings.values;
  commitValues();
  showValueChoices();
  if (state.mapEdit) setMapEdit(false);
  state.open = true;
  await showTile(restored.index);
}

// A save still being written, or one that failed, would be lost, so the browser asks before leaving; returnValue covers Chrome and Edge before 119 (https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
window.addEventListener("beforeunload", (event) => {
  if (!state.saving && element("save-problem").hidden) return;
  event.preventDefault();
  event.returnValue = true;
});

function savedSummary(record) {
  const lists = Object.values(record.objects);
  const labels = lists.reduce((sum, list) => sum + list.length, 0);
  const tiles = lists.filter((list) => list.length > 0).length;
  const when = new Date(record.savedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const seen = (record.viewed ?? record.done ?? []).length;
  const viewed = seen > 0 ? `, ${seen} viewed` : "";
  return `${labels.toLocaleString("en")} ${labels === 1 ? "label" : "labels"} on ${tiles} ${tiles === 1 ? "tile" : "tiles"}${viewed}, saved ${when}`;
}

// The area file can't be stored in the file field, so a saved area is put back as a new file with the same name.
async function fillSource(key, source) {
  document.querySelector(`input[name="source"][value="${source.kind}"]`).checked = true;
  showSourceFields();
  if (source.kind === "project") {
    element("project-link").value = source.link;
    element("threshold").value = source.threshold;
    element("all-tiles").checked = source.allMapped;
    element("imagery-override").value = source.imagery;
    return;
  }
  element("tile-template").value = source.template;
  element("area-zoom").value = source.zoom;
  const files = new DataTransfer();
  const area = await getSaved(`${key}:area`);
  if (area === undefined) throw new Error(`The area file ${source.fileName} isn't saved in this browser. Choose it again under Area.`);
  files.items.add(new File([area], source.fileName, { type: "application/geo+json" }));
  element("area-file").files = files.files;
}

function resumeItem([key, record]) {
  const text = savedSummary(record);
  const item = document.createElement("li");
  const name = document.createElement("strong");
  name.textContent = record.name;
  const details = document.createElement("span");
  details.className = "hint";
  details.textContent = text;
  const resume = document.createElement("button");
  Object.assign(resume, { type: "button", className: "secondary", textContent: "Continue" });
  resume.addEventListener("click", () => work(() => resumeSaved(key, record)));
  const remove = document.createElement("button");
  Object.assign(remove, { type: "button", className: "link", textContent: "Remove" });
  remove.addEventListener("click", () => {
    if (!window.confirm(`Remove the saved labels and settings for ${record.name}? This can't be undone.`)) return;
    work(() => removeSaved(key));
  });
  const actions = document.createElement("div");
  actions.append(resume);
  if (key !== state.storageKey) actions.append(remove);
  item.append(name, details, actions);
  return item;
}

// Download and saves read the What to label fields, so a Continue refused before the switch puts back the open project's fields.
async function resumeSaved(key, record) {
  const opened = fieldSettings();
  const openedTiles = state.tiles;
  try {
    await fillSource(key, record.source);
    element("object-name").value = record.objectName;
    element("attribute").value = record.attribute;
    element("attribute-values").value = record.values;
    commitValues();
    await load();
  } catch (error) {
    if (state.tiles === openedTiles) {
      element("object-name").value = opened.objectName;
      element("attribute").value = opened.attribute;
      element("attribute-values").value = opened.values;
      commitValues();
      showValueChoices();
    }
    throw error;
  }
}

// A project open in another tab holds its lock, so it can't be removed under that tab.
async function removeSaved(key) {
  const release = await heldLock(key);
  if (!release) throw new Error("This project or area is open in another tab. Close that tab, then remove it here.");
  try {
    await deleteSaved(key);
    await deleteSaved(`${key}:area`);
    for (const legacy of legacyKeys(Object.keys(localStorage), key)) localStorage.removeItem(legacy);
  } finally {
    release();
  }
  await showResume();
}

async function showResume() {
  const saved = (await savedEntries()).filter(([key, record]) => typeof key === "string" && key.startsWith("box-helper-objects:") && record.source);
  saved.sort(([, first], [, second]) => second.savedAt - first.savedAt);
  element("resume-list").replaceChildren(...saved.map(resumeItem));
  element("resume").hidden = saved.length === 0;
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

// Labels on tiles outside the loaded list stay saved but leave the labels download, so its status names them.
function unloadedLabels(one = "so it isn't in this file", many = "so they aren't in this file") {
  const listed = new Set(state.tiles.map((tile) => tile.id));
  const count = [...state.objects].filter(([id]) => !listed.has(id)).reduce((sum, [, objects]) => sum + objects.length, 0);
  if (count === 0) return "";
  return count === 1 ? ` 1 label is on a tile that isn't loaded, ${one}.` : ` ${count} labels are on tiles that aren't loaded, ${many}.`;
}

// The tiles file holds every listed tile, viewed or not, so a later session can restore what was checked.
function downloadTiles() {
  const fileName = outputName("tiles", "geojson");
  saveBlob(new Blob([JSON.stringify(tilesGeojson(state.tiles, state.objects, state.viewed, DETAIL_LEVELS))], { type: "application/geo+json" }), fileName);
  downloadNote(`Downloaded ${state.tiles.length} ${state.tiles.length === 1 ? "tile" : "tiles"} (${state.viewed.size} viewed) as ${fileName}.`, true);
}

// Only tiles with an object go in the labels file, so skipping past a tile never adds it.
function download(anyway = false) {
  clearDownloadNote();
  if (element("download-kind").value === "tiles") {
    downloadTiles();
    return;
  }
  const tiles = state.tiles.filter((tile) => state.objects.get(tile.id)?.length > 0);
  if (tiles.length === 0) {
    downloadNote(`Mark at least one object before downloading.${unloadedLabels("so it can't be downloaded until its tile is loaded", "so they can't be downloaded until their tiles are loaded")}`);
    return;
  }
  const objectName = element("object-name").value.trim();
  const problem = objectName ? valuesProblem(attributeName(), enteredValues()) ?? valueLabelsProblem(tiles) : "Enter the object name under Change.";
  if (problem && !anyway) {
    downloadNote(problem);
    element("download-anyway").hidden = false;
    return;
  }
  const mode = outputMode();
  const settings = problem ? keptSettings(attributeName(), attributeValues(element("attribute-values").value), tiles.flatMap((tile) => state.objects.get(tile.id))) : { attribute: attributeName(), values: values() };
  const geojson = labelsGeojson(tiles, shapedObjects(tiles, mode), { mode, objectName, ...settings, pixels: PIXELS });
  const fileName = outputName(`labels_${mode}`, "geojson");
  saveBlob(new Blob([JSON.stringify(geojson)], { type: "application/geo+json" }), fileName);
  const saved = `Downloaded the labels of ${tiles.length} ${tiles.length === 1 ? "tile" : "tiles"} as ${fileName}.`;
  downloadNote(problem ? `${saved}${unloadedLabels()} Fix this before you deliver it: ${problem}` : `${saved}${unloadedLabels()}`, !problem);
}

function clearDownloadNote() {
  element("download-note").textContent = "";
  element("download-anyway").hidden = true;
}

// The note sits under the Download button, where the person is looking, and any edit clears it.
function downloadNote(message, saved = false) {
  setStatus(message, !saved);
  element("download-note").textContent = message;
  element("download-note").classList.toggle("hint", saved);
  element("download-note").classList.toggle("problem", !saved);
}

function shapedObjects(tiles, mode) {
  if (mode !== "obb") return state.objects;
  return new Map(tiles.map((tile) => [tile.id, state.objects.get(tile.id).map((object) => (keepsDrawnShape(object) ? object : { ...object, corners: orientedCorners(object.outline) }))]));
}

function outputName(kind, extension) {
  return state.threshold === null ? `${state.name}_${kind}.${extension}` : `${state.name}_${kind}_${state.threshold}.${extension}`;
}

function saveBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function parsedLabels(text, file) {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`${file.name} is not valid GeoJSON.`, { cause: error });
  }
}

function restoreViewed(ids, file) {
  const known = new Set(state.allTiles.map((tile) => tile.id));
  const found = ids.filter((id) => known.has(id) && !state.viewed.has(id));
  const other = ids.filter((id) => !known.has(id)).length;
  for (const id of found) state.viewed.add(id);
  state.tiles = withSavedTiles(state.tiles, state.allTiles, { viewed: [...state.viewed] });
  const elsewhere = other > 0 ? ` ${other} ${other === 1 ? "tile isn't" : "tiles aren't"} in this project or area.` : "";
  const matched = ids.length - other;
  const added = found.length > 0
    ? `Added ${found.length} viewed ${found.length === 1 ? "tile" : "tiles"} from ${file.name}.`
    : matched > 0
      ? `Every viewed tile in ${file.name} was already viewed here.`
      : ids.length === 0 ? `${file.name} doesn't list any viewed tiles.` : `None of the viewed tiles in ${file.name} were added.`;
  afterChange(`${added}${elsewhere}`);
  refreshMap();
}

async function loadLabels(file) {
  if (state.mapEdit) setMapEdit(false);
  const geojson = parsedLabels(await file.text(), file);
  const viewedIds = tilesFileViewed(geojson);
  if (viewedIds) {
    restoreViewed(viewedIds, file);
    return;
  }
  const { shapes, skipped } = polygonRings(geojson);
  if (shapes.length === 0) throw new Error(`${file.name} needs at least one polygon.`);
  fillEmptySettings(fileSettings(geojson, shapes));
  const shapesOf = (object) => [object.outline, closedRing(orientedCorners(object.outline))];
  const { objects, count, repeated } = placedLabels({ shapes, tiles: state.tiles, objects: state.objects, fileName: file.name, attribute: fileAttribute(geojson, attributeName()), pixels: PIXELS, clip: clipToTile, shapesOf });
  state.objects = objects;
  state.tiles = withSavedTiles(state.tiles, state.allTiles, { objects: Object.fromEntries(objects) });
  const listed = new Set(state.tiles.map((tile) => tile.id));
  const unlisted = [...objects].filter(([id]) => !listed.has(id)).reduce((sum, [, list]) => sum + list.filter((object) => object.source === file.name).length, 0);
  const alreadyThere = repeated > 0 ? ` ${repeated} ${repeated === 1 ? "was already on its tile" : "were already on their tiles"}.` : "";
  const elsewhere = unlisted > 0 ? (unlisted === 1 ? " 1 is on a tile that isn't loaded; it stays saved but isn't in the download." : ` ${unlisted} are on tiles that aren't loaded; they stay saved but aren't in the download.`) : "";
  const leftOut = skipped > 0 ? ` ${skipped} ${skipped === 1 ? "feature without a polygon was" : "features without a polygon were"} left out.` : "";
  afterChange(`Loaded ${count} ${count === 1 ? "label" : "labels"} from ${file.name}.${alreadyThere}${elsewhere}${leftOut} ${objectCount()}`);
  refreshMap();
}

function fillEmptySettings({ objectName, attribute, values: fileValues }) {
  if (!element("object-name").value.trim()) element("object-name").value = objectName;
  if (attribute && !attributeName()) {
    element("attribute").value = attribute;
    element("attribute-values").value = fileValues;
    commitValues();
    showValueChoices();
  }
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
    return valued > 0 ? `${valued} ${valued === 1 ? "label has" : "labels have"} a value. Enter the attribute and its values under Change.` : null;
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
  const relabel = state.mapEdit && state.picked.length > 0;
  if (relabel && busyEditing()) return;
  state.value = value;
  element("value-choices").querySelector(`input[value="${CSS.escape(value)}"]`).checked = true;
  if (relabel) {
    state.mapUndo.push({ kind: "value", items: state.picked.map(({ object }) => ({ object, value: object.value })) });
    for (const { object } of state.picked) object.value = value;
    mapChanged(`Set ${state.picked.length === 1 ? "the selected label" : `${state.picked.length} selected labels`} to ${attributeName()}: ${value}.`);
    return;
  }
  if (!state.busy) setStatus(`Picked ${attributeName()}: ${value}.`);
}

// A shortcut clicks its control, so a disabled control ignores it; arrow keys on a focused choice keep moving between its options.
document.addEventListener("keydown", (event) => {
  const { classList } = document.body;
  if (event.defaultPrevented) return;
  if (!classList.contains("loaded") || classList.contains("editing")) return;
  if (event.target.closest('input:not([type="radio"]):not([type="checkbox"]), select, textarea')) return;
  const action = keyAction(event.key, event);
  if (action && !(event.target.matches('input[type="radio"]') && (action === "previous" || action === "next"))) {
    event.preventDefault();
    if (action === "undo" && event.repeat) return;
    if (action === "review" && state.mapEdit) {
      if (!state.map.cancelSide()) clearSelection();
      return;
    }
    if (action === "review" && !state.open && state.tileSet.length > 0) {
      clearSelection();
      return;
    }
    if (action === "review" && state.side) {
      clearSide();
      drawObjects();
      setStatus(toolHint());
      return;
    }
    const control = { tool: document.querySelector('input[name="tool"]:not(:checked)'), review: element("review") }[action] ?? element(action);
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
  element("values-keys").hidden = list.length === 0;
  element("values-last").textContent = list.length;
  if (!list.includes(state.value)) state.value = list[0] ?? "";
  const legend = document.createElement("legend");
  legend.textContent = attributeName();
  const shown = document.createElement("span");
  shown.className = "attribute-name";
  shown.textContent = attributeName();
  shown.setAttribute("aria-hidden", "true");
  choices.replaceChildren(legend, shown, ...list.map(valueChoice));
  choices.classList.toggle("long-values", list.some((value) => value.length > LONG_VALUE));
}

function changeValues() {
  showValueChoices();
  if (state.tiles.length === 0) return;
  saveObjects();
  drawObjects();
  showCounts();
  const problem = valuesProblem(attributeName(), enteredValues());
  setStatus(problem ?? objectCount(), problem !== null);
  refreshMap();
}

function commitValues() {
  state.committedValues = enteredValues();
  state.committedPick = state.value;
}

// Without this, a renamed value's labels turn grey and need a value again one by one.
function renameValue() {
  const [before, pick] = [state.committedValues, state.committedPick];
  commitValues();
  const rename = renamedValue(before, state.committedValues);
  if (!rename) return;
  const onTiles = new Set([...state.objects.values()].flat());
  // Labels held for Undo or for restoring a cleared tile are renamed too, so bringing them back doesn't bring back a value that is gone.
  const held = new Set([...onTiles, ...(state.cleared?.objects ?? []), ...state.mapUndo.flatMap((record) => record.items.map((item) => item.object))]);
  const moved = renameLabels([...held], state.mapUndo, rename);
  if (!moved) {
    [state.committedValues, state.committedPick] = [before, pick];
    setStatus(`Some labels, or labels that Undo can bring back, already have the value ${rename.to}, so the ${rename.from} labels keep ${rename.from} and are grey. Type ${rename.from} back, or type another name.`, true);
    return;
  }
  if (pick === rename.from) state.value = state.committedPick = rename.to;
  const labels = moved.filter((label) => onTiles.has(label));
  changeValues();
  if (labels.length === 0) return;
  setStatus(`Renamed ${rename.from} to ${rename.to} on ${labels.length === 1 ? "1 label" : `${labels.length} labels`}.`);
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
  showResume().catch(showError);
});
showResume().catch(showError);
element("object-name").addEventListener("input", () => {
  if (state.tiles.length > 0) saveObjects();
});
element("attribute").addEventListener("input", changeValues);
element("attribute-values").addEventListener("input", changeValues);
element("attribute-values").addEventListener("change", renameValue);
element("download").addEventListener("click", () => work(download));
element("download-anyway").addEventListener("click", () => work(() => download(true)));
element("map-clear").addEventListener("click", clearSelection);
element("download-kind").addEventListener("change", clearDownloadNote);
for (const choice of document.querySelectorAll('input[name="source"]')) choice.addEventListener("change", showSourceFields);
element("focus").addEventListener("change", () => {
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
