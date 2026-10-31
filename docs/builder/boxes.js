import { AutoProcessor, EdgeTamModel, RawImage, Tensor } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
import { contours } from "https://cdn.jsdelivr.net/npm/d3-contour@4.0.2/+esm";
import { simplify } from "https://cdn.jsdelivr.net/npm/@turf/simplify@7.4.0/+esm";
import { EXAMPLE_PROJECT } from "./results-tools.js";
import { loadProject } from "./results-file.js";
import { foldSetup, setStatus } from "./setup-card.js";
import { TILE_PIXELS, boxOutline, cellRectangle, datasetYaml, detailTiles, dragBox, isDrag, isOutsideImage, keptTiles, largestRing, maskBox, restoredObjects, savedObjectsKey, segmentLabels, yoloLabels } from "./boxes-tools.js";

const DETAIL_LEVELS = 2;
const PIXELS = TILE_PIXELS * 2 ** DETAIL_LEVELS;
// One pixel keeps the label files small; on 36 Freetown objects the outline area changed by at most 2%.
const OUTLINE_TOLERANCE = 1;

const state = { tiles: [], index: 0, objects: new Map(), images: new Map(), name: "", threshold: 0, storageKey: "", modelId: "", modelName: "", model: null, processor: null, prompt: null, drag: null, busy: false };
const element = (id) => document.getElementById(id);
const tileCanvas = element("tile-canvas");
const boxCanvas = element("box-canvas");

// The model blocks the page while it runs, so the status is drawn first.
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

function outputMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function currentTile() {
  return state.tiles[state.index];
}

function currentObjects() {
  return state.objects.get(currentTile().id) ?? [];
}

function objectCount() {
  return `${currentObjects().length} objects on this tile.`;
}

function drawObjects() {
  const context = boxCanvas.getContext("2d");
  context.clearRect(0, 0, PIXELS, PIXELS);
  const tile = currentTile();
  context.setLineDash([12, 8]);
  context.lineWidth = 2;
  context.strokeStyle = "#ffffff";
  for (const cell of tile.cells) {
    const [x1, y1, x2, y2] = cellRectangle(cell, tile.size, PIXELS);
    context.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
  if (state.drag?.box) {
    const [x1, y1, x2, y2] = state.drag.box;
    context.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
  context.setLineDash([]);
  context.lineWidth = 4;
  context.strokeStyle = "#d73f3f";
  for (const { box: [x1, y1, x2, y2], outline } of currentObjects()) {
    if (outputMode() === "segment") {
      context.beginPath();
      outline.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
      context.closePath();
      context.stroke();
    } else {
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
  }
  updateControls();
}

// While the model or the network works, every control is off, so no second task starts on top of it.
function updateControls() {
  const loaded = state.tiles.length > 0;
  element("previous").disabled = state.busy || !loaded || state.index === 0;
  element("next").disabled = state.busy || !loaded || state.index === state.tiles.length - 1;
  element("undo").disabled = state.busy || !loaded || currentObjects().length === 0;
  element("draw").disabled = state.busy || !loaded;
  element("download").disabled = state.busy || !loaded;
  for (const control of document.querySelectorAll('#setup button, #model, #change, input[name="mode"]')) control.disabled = state.busy;
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
  localStorage.setItem(state.storageKey, JSON.stringify({ tile: currentTile().id, objects: Object.fromEntries(state.objects) }));
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

// The deeper sub-tiles are stitched into one image; it is kept so the download needs no second fetch.
async function tileImage(tile) {
  if (!state.images.has(tile.id)) {
    const parts = await Promise.all(detailTiles(tile, DETAIL_LEVELS).map(async (part) => ({ ...part, image: await loadImage(part.url) })));
    const canvas = new OffscreenCanvas(PIXELS, PIXELS);
    const context = canvas.getContext("2d");
    for (const { image, left, top } of parts.filter((part) => part.image)) {
      context.drawImage(image, left, top, TILE_PIXELS, TILE_PIXELS);
      image.close();
    }
    state.images.set(tile.id, await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 }));
  }
  return state.images.get(tile.id);
}

async function showTile(index) {
  state.index = index;
  state.prompt = null;
  const tile = currentTile();
  element("position").textContent = `Tile ${index + 1} of ${state.tiles.length}: ${tile.id}, ${tile.cells.length} marked cells`;
  tileCanvas.getContext("2d").clearRect(0, 0, PIXELS, PIXELS);
  drawObjects();
  setStatus("Loading the imagery...");
  const blob = await tileImage(tile);
  if (!state.objects.has(tile.id)) state.objects.set(tile.id, []);
  saveObjects();
  tileCanvas.getContext("2d").drawImage(await createImageBitmap(blob), 0, 0);
  setStatus(`${state.modelName} is reading the image...`);
  await nextPaint();
  const inputs = await state.processor(await RawImage.fromBlob(blob));
  const embeddings = await state.model.get_image_embeddings(inputs);
  state.prompt = { inputs, embeddings };
  setStatus(`Ready. ${objectCount()}`);
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
  const objectBox = maskBox(mask, width, height);
  if (!objectBox) return null;
  const shape = contours().size([width, height]).smooth(false).thresholds([0.5])(mask)[0];
  const ring = largestRing(shape.coordinates);
  const outline = simplify({ type: "Polygon", coordinates: [ring] }, { tolerance: OUTLINE_TOLERANCE }).coordinates[0];
  return { box: objectBox, outline };
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

boxCanvas.addEventListener("pointermove", (event) => {
  if (!state.drag) return;
  const end = imagePoint(event);
  state.drag.box = isDrag(state.drag.start, end) ? dragBox(state.drag.start, end, PIXELS) : null;
  drawObjects();
});

boxCanvas.addEventListener("pointerup", (event) => {
  if (!state.drag || state.busy) {
    state.drag = null;
    return;
  }
  const { start } = state.drag;
  state.drag = null;
  const end = imagePoint(event);
  const box = isDrag(start, end) ? dragBox(start, end, PIXELS) : null;
  const point = box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : start;
  const objects = currentObjects();
  if (box && drawing()) {
    objects.push({ box, outline: boxOutline(box) });
    afterChange(`Drawn by hand. ${objectCount()}`);
    return;
  }
  work(async () => {
    setStatus(`${state.modelName} is finding the object...`);
    drawObjects();
    await nextPaint();
    const object = await findObject({ point, box });
    if (object) objects.push(object);
    afterChange(object ? objectCount() : "Nothing found there. Drag closer around the object.");
  });
});

function drawing() {
  return element("draw").getAttribute("aria-pressed") === "true";
}

element("draw").addEventListener("click", () => {
  element("draw").setAttribute("aria-pressed", String(!drawing()));
});

boxCanvas.addEventListener("pointercancel", () => {
  state.drag = null;
  drawObjects();
});

// A full or blocked storage throws a DOMException; the object stays on the page and the status says it was not saved.
function afterChange(message) {
  drawObjects();
  try {
    saveObjects();
    setStatus(message);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    setStatus(`${message} The objects could not be saved in this browser: ${error.message}`);
  }
}

element("undo").addEventListener("click", () => {
  currentObjects().pop();
  afterChange(objectCount());
});

function showError(error) {
  console.error(error);
  setStatus(error.message);
}

element("previous").addEventListener("click", () => work(() => showTile(state.index - 1)));
element("next").addEventListener("click", () => work(() => showTile(state.index + 1)));

for (const choice of document.querySelectorAll('input[name="mode"]')) {
  choice.addEventListener("change", () => {
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

async function load(link) {
  setStatus("Reading the results...");
  const threshold = Number(element("threshold").value);
  const { name, fileName, rows } = await loadProject(link);
  const tiles = keptTiles(rows, threshold);
  if (tiles.length === 0) throw new Error("No cell reaches that share of volunteers. Lower the share and load again.");
  const storageKey = savedObjectsKey(rows, threshold);
  const restored = restoredObjects(readSaved(storageKey), tiles);
  await loadModel();
  state.tiles = tiles;
  state.images = new Map();
  state.name = fileName;
  state.threshold = threshold;
  state.storageKey = storageKey;
  state.objects = restored.objects;
  foldSetup(`${name}, ${threshold}% share`);
  element("stage-area").scrollIntoView({ block: "start" });
  await showTile(restored.index);
}

element("setup").addEventListener("submit", (event) => {
  event.preventDefault();
  work(() => load(element("project-link").value.trim()));
});

element("example").addEventListener("click", () => {
  element("project-link").value = EXAMPLE_PROJECT;
  element("setup").requestSubmit();
});

// Only tiles with an object go in the dataset, so skipping past a tile never adds it as an image without objects.
async function download() {
  const objectName = element("object-name").value.trim();
  if (!objectName) {
    setStatus("Enter the object name before downloading.");
    return;
  }
  const found = [...state.objects].filter(([, objects]) => objects.length > 0);
  if (found.length === 0) {
    setStatus("Mark at least one object before downloading.");
    return;
  }
  const mode = outputMode();
  setStatus(`Preparing ${found.length} images...`);
  const zip = new JSZip();
  for (const [id, objects] of found) {
    zip.file(`images/${id}.jpg`, await tileImage(state.tiles.find((tile) => tile.id === id)));
    const labels = mode === "segment" ? segmentLabels(objects.map(({ outline }) => outline), PIXELS) : yoloLabels(objects.map(({ box }) => box), PIXELS);
    zip.file(`labels/${id}.txt`, labels);
  }
  zip.file("data.yaml", datasetYaml(objectName));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  link.download = `${state.name}_yolo_${mode}_${state.threshold}.zip`;
  link.click();
  setStatus(`Downloaded ${found.length} tiles with objects.`);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

element("download").addEventListener("click", () => work(download));
