import { EXAMPLE_IMAGES, mosaicTileUrl, parseImageIds, unionBounds } from "./mosaic-tools.js";

const STAC_ITEMS = "https://api.imagery.hotosm.org/stac/collections/openaerialmap/items";
const element = (id) => document.getElementById(id);

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ecf1" } }] },
  center: [0, 20],
  zoom: 1,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

function setStatus(message) {
  element("status").textContent = message;
}

function replaceSource(id, source, layer) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
  map.addSource(id, source);
  map.addLayer({ id, source: id, ...layer });
}

async function fetchItem(id) {
  const response = await fetch(`${STAC_ITEMS}/${id}`);
  if (!response.ok) throw new Error(`Image ${id} was not found (HTTP ${response.status}).`);
  return response.json();
}

function addImageInput(value = "") {
  const row = document.createElement("div");
  row.className = "image-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = "https://imagery.hotosm.org/browse?...&selected_id=...";
  input.setAttribute("aria-label", "Image link, Copy TMS URL or ID");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "secondary";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    row.remove();
    updateRemoveButtons();
  });
  row.append(input, remove);
  element("image-inputs").append(row);
  updateRemoveButtons();
  return input;
}

// A mosaic needs two images, so the last two rows cannot be removed.
function updateRemoveButtons() {
  const buttons = element("image-inputs").querySelectorAll("button");
  for (const button of buttons) button.disabled = buttons.length <= 2;
}

function imageValues() {
  return [...element("image-inputs").querySelectorAll("input")].map((input) => input.value);
}

function showImageList(items) {
  element("image-list").replaceChildren(...items.map((item) => {
    const entry = document.createElement("li");
    const date = item.properties?.datetime ?? item.properties?.start_datetime;
    entry.textContent = `${item.properties?.title ?? item.id} (${date?.slice(0, 10) ?? "no date"})`;
    return entry;
  }));
}

element("setup").addEventListener("submit", async (event) => {
  event.preventDefault();
  element("details").hidden = true;
  element("copy").disabled = true;
  try {
    const ids = parseImageIds(imageValues());
    setStatus(`Merging ${ids.length} images...`);
    const items = await Promise.all(ids.map(fetchItem));
    const tileUrl = mosaicTileUrl(ids);
    const bounds = unionBounds(items.map((item) => item.bbox));

    replaceSource("mosaic", { type: "raster", tiles: [tileUrl], tileSize: 256, maxzoom: 22, bounds }, { type: "raster" });
    const outlines = { type: "FeatureCollection", features: items.map((item) => ({ type: "Feature", geometry: item.geometry, properties: {} })) };
    replaceSource("outlines", { type: "geojson", data: outlines }, { type: "line", paint: { "line-color": "#d73f3f", "line-width": 2 } });
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 20 });

    element("tile-url").textContent = tileUrl;
    showImageList(items);
    element("details").hidden = false;
    element("copy").disabled = false;
    setStatus("The map shows the merged imagery. Red lines are the image outlines. Use the tile URL in the manager and the scenario builder.");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

element("add-image").addEventListener("click", () => addImageInput().focus());

element("example").addEventListener("click", () => {
  element("image-inputs").replaceChildren();
  for (const image of EXAMPLE_IMAGES) addImageInput(image);
  element("setup").requestSubmit();
});

addImageInput();
addImageInput();

element("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(element("tile-url").textContent);
  setStatus("Tile URL copied.");
});
