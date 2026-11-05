import { EXAMPLE, checkTasks, checkTileAccess, emptyReferences, nextAnswer, scenarioFile, scenarioMessages, taskBounds, tileImageUrl } from "./scenarios.js";
import { copyText, foldSetup, setStatus } from "./setup-card.js";

const state = { tileUrl: "", tasks: null, subGridSize: 4, scenarios: [], active: -1 };
const element = (id) => document.getElementById(id);
const chosenSubGrid = () => Number(document.querySelector('input[name="sub-grid"]:checked').value);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

function replaceSource(id, source) {
  for (const layer of map.getStyle().layers.filter((layer) => layer.source === id)) map.removeLayer(layer.id);
  if (map.getSource(id)) map.removeSource(id);
  map.addSource(id, source);
}

function showImagery(bounds) {
  replaceSource("imagery", { type: "raster", tiles: [state.tileUrl], tileSize: 256, maxzoom: 22, bounds: bounds.flat() });
  map.addLayer({ id: "imagery", type: "raster", source: "imagery" });
}

function showTasks(tasks) {
  replaceSource("tasks", { type: "geojson", data: tasks });
  map.addLayer({ id: "tasks-fill", type: "fill", source: "tasks", paint: { "fill-color": "#ffffff", "fill-opacity": 0.01 } });
  map.addLayer({ id: "tasks-line", type: "line", source: "tasks", paint: { "line-color": "#d73f3f", "line-width": 1 } });
  replaceSource("scenarios", { type: "geojson", data: scenarioFile([]) });
  map.addLayer({ id: "scenarios-line", type: "line", source: "scenarios", paint: { "line-color": "#ffdd00", "line-width": 4 } });
  map.fitBounds(taskBounds(tasks), { padding: 20 });
}

function render() {
  map.getSource("scenarios")?.setData(scenarioFile(state.scenarios));
  element("download").disabled = state.scenarios.length === 0;

  const list = element("scenario-list");
  list.replaceChildren(...state.scenarios.map((scenario, index) => {
    const item = document.createElement("li");
    const marked = scenario.references.filter((answer) => answer > 0).length;
    item.textContent = `Screen ${index + 1}: tile ${scenario.tileX}, ${scenario.tileY} (${marked} cells marked)`;
    item.classList.toggle("active", index === state.active);
    item.addEventListener("click", () => { state.active = index; render(); });
    return item;
  }));

  const scenario = state.scenarios[state.active];
  const opening = element("editor").hidden && scenario;
  element("editor").hidden = !scenario;
  if (!scenario) return;
  element("editor-title").textContent = `Screen ${state.active + 1}`;
  element("tile-image").src = tileImageUrl(state.tileUrl, scenario.tileX, scenario.tileY, scenario.tileZ);
  const cells = element("cells");
  cells.style.gridTemplateColumns = `repeat(${state.subGridSize}, 1fr)`;
  cells.replaceChildren(...scenario.references.map((answer, cell) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cell answer-${answer}`;
    button.textContent = cell;
    button.addEventListener("click", () => { scenario.references[cell] = nextAnswer(answer); render(); });
    return button;
  }));
  if (opening) element("done").focus();
}

function messageField(caption, label, text, multiline) {
  const field = document.createElement("div");
  field.className = "message-field";
  const heading = document.createElement("span");
  heading.textContent = caption;
  const box = document.createElement(multiline ? "textarea" : "input");
  if (multiline) box.rows = 3;
  box.value = text;
  box.setAttribute("aria-label", label);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "secondary";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", `Copy ${label.toLowerCase()}`);
  copy.addEventListener("click", () => copyText(box.value, label));
  const row = document.createElement("div");
  row.className = "field-row";
  row.append(box, copy);
  field.append(heading, row);
  return field;
}

function showMessages() {
  element("message-list").replaceChildren(...scenarioMessages(element("object-name").value).map(({ name, icon, title, description }) => {
    const message = document.createElement("details");
    message.className = "message";
    const summary = document.createElement("summary");
    const iconName = document.createElement("span");
    iconName.className = "message-icon";
    iconName.textContent = `Icon: ${icon}`;
    summary.append(name, iconName);
    const body = document.createElement("div");
    body.className = "message-body";
    body.append(messageField("Title", `${name} title`, title, false), messageField("Description", `${name} description`, description, true));
    message.append(summary, body);
    return message;
  }));
}

element("object-name").addEventListener("input", showMessages);

element("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await load(JSON.parse(await element("tasks-file").files[0].text()));
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

async function load(tasks) {
  checkTasks(tasks);
  const tileUrl = element("tile-url").value.trim();
  setStatus("Checking the tile URL...");
  await checkTileAccess(tileUrl, tasks.features[0]);
  state.tasks = tasks;
  state.tileUrl = tileUrl;
  state.subGridSize = chosenSubGrid();
  state.scenarios = [];
  state.active = -1;
  showImagery(taskBounds(tasks));
  showTasks(tasks);
  foldSetup(`${tasks.features.length} tasks`);
  element("messages").hidden = false;
  showMessages();
  setStatus("Click a task to add it as a scenario.");
  render();
}

element("example").addEventListener("click", async () => {
  try {
    const response = await fetch(EXAMPLE.tasks);
    if (!response.ok) throw new Error(`The example tasks failed to load (HTTP ${response.status}).`);
    element("tile-url").value = EXAMPLE.tileUrl;
    document.querySelector('input[name="sub-grid"][value="4"]').checked = true;
    await load(await response.json());
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

element("sub-grid-sizes").addEventListener("change", () => {
  state.subGridSize = chosenSubGrid();
  for (const scenario of state.scenarios) scenario.references = emptyReferences(state.subGridSize);
  if (state.scenarios.length) setStatus("Sub-grid changed, so every scenario's answers were reset.");
  render();
});

map.on("click", "tasks-fill", (event) => {
  const { tile_x: tileX, tile_y: tileY, tile_z: tileZ } = event.features[0].properties;
  const existing = state.scenarios.findIndex((scenario) => scenario.tileX === tileX && scenario.tileY === tileY);
  if (existing >= 0) {
    state.active = existing;
  } else {
    // Map features are clipped to vector tiles, so the export takes the geometry from the loaded file.
    const task = state.tasks.features.find((feature) => feature.properties.tile_x === tileX && feature.properties.tile_y === tileY);
    state.scenarios.push({ geometry: task.geometry, tileX, tileY, tileZ, references: emptyReferences(state.subGridSize) });
    state.active = state.scenarios.length - 1;
  }
  render();
});

function closeEditor() {
  state.active = -1;
  render();
  map.getCanvas().focus();
}

element("remove").addEventListener("click", () => {
  state.scenarios.splice(state.active, 1);
  closeEditor();
});
element("done").addEventListener("click", closeEditor);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.active >= 0) closeEditor();
});

element("download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(scenarioFile(state.scenarios), null, 2)], { type: "application/geo+json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tutorial_scenarios.geojson";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
