import { checkTasks, emptyReferences, nextAnswer, scenarioFile, taskBounds, tileImageUrl } from "./scenarios.js";

const state = { tileUrl: "", tasks: null, subGridSize: 4, scenarios: [], active: -1 };
const element = (id) => document.getElementById(id);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
});

function setStatus(message) {
  element("status").textContent = message;
}

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
}

element("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const tasks = JSON.parse(await element("tasks-file").files[0].text());
    checkTasks(tasks);
    state.tasks = tasks;
    state.tileUrl = element("tile-url").value.trim();
    state.subGridSize = Number(element("sub-grid").value);
    state.scenarios = [];
    state.active = -1;
    showImagery(taskBounds(tasks));
    showTasks(tasks);
    setStatus(`${tasks.features.length} tasks loaded. Click a task on the map to add it as a scenario.`);
    render();
  } catch (error) {
    setStatus(error.message);
  }
});

element("sub-grid").addEventListener("change", () => {
  state.subGridSize = Number(element("sub-grid").value);
  for (const scenario of state.scenarios) scenario.references = emptyReferences(state.subGridSize);
  if (state.scenarios.length) setStatus("Sub-grid size changed, so every scenario's answers were reset.");
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

element("remove").addEventListener("click", () => {
  state.scenarios.splice(state.active, 1);
  state.active = state.scenarios.length - 1;
  render();
});

element("download").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(scenarioFile(state.scenarios), null, 2)], { type: "application/geo+json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tutorial_scenarios.geojson";
  link.click();
  URL.revokeObjectURL(link.href);
});
