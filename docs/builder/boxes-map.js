import { rectangleFromSide } from "./boxes-tools.js";
import { showMapLoading } from "./map-loading.js";

const SELECTED_COLOUR = "#ffd400";
const LABELLED_COLOUR = "#1f9d55";
const LABELLED_FILL = "#4ade80";
const UNLISTED_COLOUR = "#bdbdbd";
const EMPTY = { type: "FeatureCollection", features: [] };
// Below this, in screen pixels, a drag is a click and a box has no width.
const DRAG_SCREEN_PIXELS = 6;

// A loop, since spreading every point into Math.min can pass the engine's argument limit (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply#using_apply_and_built-in_functions).
function bounds(features) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    for (const [longitude, latitude] of feature.geometry.coordinates[0]) {
      box[0] = Math.min(box[0], longitude);
      box[1] = Math.min(box[1], latitude);
      box[2] = Math.max(box[2], longitude);
      box[3] = Math.max(box[3], latitude);
    }
  }
  return box;
}

// MapLibre allows zoom levels up to 24 (https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/).
function shownZoom(view) {
  return Math.min(view.maxzoom + 1, 24);
}

const HOVERED = ["boolean", ["feature-state", "hover"], false];
// A tile with labels counts as seen even when they came from a file and the tile was never opened.
const SEEN = ["any", ["get", "labelled"], ["get", "viewed"]];
// Levels below the tile zoom where the grey grid starts to fade in and where it is fully drawn; MapLibre zoom counts 512-pixel tiles, so a tile is 32 pixels wide 4 levels below.
const GRID_HIDDEN = 4.5;
const GRID_SHOWN = 3.5;
// Clicks reach a grey tile once its border is about a fifth drawn.
const GRID_CLICKABLE = GRID_HIDDEN - 0.3;

// Zoomed out, a tile is a few pixels wide, so only a fill shows whether it has labels.
function fadeTiles(map, view) {
  const tileZoom = view.maxzoom - 2;
  const byZoom = (zoomedOut, zoomedIn, from, to) => ["interpolate", ["linear"], ["zoom"], tileZoom - from, zoomedOut, tileZoom - to, zoomedIn];
  map.setPaintProperty("tiles-fill", "fill-opacity", byZoom(["case", HOVERED, 0.35, SEEN, 0.85, ["get", "listed"], 0.3, 0], ["case", HOVERED, 0.35, SEEN, 0.2, 0], 3, 2));
  map.setPaintProperty("tiles-line", "line-opacity", byZoom(["case", HOVERED, 1, SEEN, 0.9, ["get", "listed"], 0.5, 0], ["case", HOVERED, 1, SEEN, 0.9, ["get", "listed"], 0.5, 0.7], GRID_HIDDEN, GRID_SHOWN));
  map.setPaintProperty("tiles-halo", "line-opacity", byZoom(["case", ["get", "listed"], 0.45, 0], ["case", ["get", "listed"], 0.45, 0.2], GRID_HIDDEN, GRID_SHOWN));
}

function addImagery(map, view) {
  map.addSource("imagery", { type: "raster", tiles: [view.template], tileSize: 256, maxzoom: view.maxzoom });
  map.addLayer({ id: "imagery", type: "raster", source: "imagery" }, "tiles-fill");
}

function addLayers(map, view) {
  map.addSource("tiles", { type: "geojson", data: view.grid, promoteId: "index" });
  map.addSource("labels", { type: "geojson", data: view.labels });
  map.addSource("selected", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "tiles-fill", type: "fill", source: "tiles", paint: { "fill-color": ["case", ["get", "labelled"], LABELLED_FILL, "#ffffff"], "fill-opacity": 0 } });
  map.addLayer({ id: "tiles-halo", type: "line", source: "tiles", paint: { "line-color": "#000000", "line-width": ["case", ["get", "listed"], 4, 1] } });
  map.addLayer({ id: "tiles-line", type: "line", source: "tiles", paint: { "line-color": ["case", HOVERED, "#ffffff", ["get", "labelled"], LABELLED_COLOUR, ["get", "listed"], "#ffffff", UNLISTED_COLOUR], "line-width": ["case", HOVERED, 3, ["get", "labelled"], 3, ["get", "viewed"], 2, ["get", "listed"], 1, 1] } });
  map.addLayer({ id: "labels-fill", type: "fill", source: "labels", paint: { "fill-color": view.colour, "fill-opacity": 0.15 } });
  map.addLayer({ id: "labels-line", type: "line", source: "labels", paint: { "line-color": view.colour, "line-width": 2 } });
  map.addLayer({ id: "selected", type: "line", source: "selected", paint: { "line-color": SELECTED_COLOUR, "line-width": 3 } });
  map.addSource("picked", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "picked-casing", type: "line", source: "picked", paint: { "line-color": "#000000", "line-width": 5 } });
  map.addLayer({ id: "picked", type: "line", source: "picked", paint: { "line-color": "#ffffff", "line-width": 3 } });
  map.addSource("draft", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "draft", type: "line", source: "draft", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2] } });
  addImagery(map, view);
  fadeTiles(map, view);
}

// Call show() only while the container is visible; the first fitBounds needs its size.
// onDraw gets the box ring in longitude and latitude, null when zoomed out too far, or "thin" for a box without width.
export function createTileMap(container, onPick, { onDraw, onSelect, onSide, rotated }) {
  const map = new maplibregl.Map({ container, style: { version: 8, sources: {}, layers: [] }, center: [0, 0], zoom: 1, attributionControl: false, dragRotate: false, pitchWithRotate: false, keyboard: false, maxPitch: 0 });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
  showMapLoading(map);
  const ready = new Promise((resolve) => map.once("load", resolve));
  let shown = null;
  let layered = false;
  let imageryKey = null;

  // Zoomed out, the tiles outside the list are hidden, so they take neither clicks nor hover until their grey borders show.
  const zoomedOut = () => map.getZoom() < shown.maxzoom - 2 - GRID_CLICKABLE;
  const hidden = ({ listed }) => !listed && (!shown || zoomedOut());
  let editing = false;
  map.on("click", "tiles-fill", (event) => {
    const { properties } = event.features[0];
    if (editing || hidden(properties)) return;
    hover(null);
    onPick(properties.index);
  });
  let hovered = null;
  function hover(index) {
    if (hovered !== null) map.setFeatureState({ source: "tiles", id: hovered }, { hover: false });
    hovered = index;
    if (hovered !== null) map.setFeatureState({ source: "tiles", id: hovered }, { hover: true });
    map.getCanvas().style.cursor = editing ? "crosshair" : hovered === null ? "" : "pointer";
  }
  map.on("mousemove", "tiles-fill", (event) => {
    const { properties } = event.features[0];
    hover(hidden(properties) ? null : properties.index);
  });
  map.on("mouseleave", "tiles-fill", () => hover(null));

  // MapLibre pans only with the left button (https://unpkg.com/maplibre-gl@5.24.0/src/ui/handler/mouse.ts), so the middle button, and Space with a drag in Edit, move the map, as on the Label tile.
  const surface = map.getCanvasContainer();
  let space = false;
  let drag = null;
  const typing = 'input:not([type="radio"]):not([type="checkbox"]), select, textarea';
  for (const type of ["keydown", "keyup"]) {
    document.addEventListener(type, (event) => {
      if (event.key !== " " || !editing || event.target.closest(typing)) return;
      event.preventDefault();
      space = type === "keydown";
    });
  }
  window.addEventListener("blur", () => { space = false; });
  const pointOf = (event) => {
    const { left, top } = surface.getBoundingClientRect();
    return { x: event.clientX - left, y: event.clientY - top };
  };
  // With rotated boxes, a drag sets one side and a click or slide sets the opposite one, as on the Label tile; the side is kept in longitude and latitude so a pan in between keeps it in place.
  let side = null;
  let pointer = null;
  const toScreen = (lngLat) => {
    const { x, y } = map.project(lngLat);
    return [x, y];
  };
  const screenRing = (ring) => ring.map((point) => map.unproject(point).toArray());
  const boxRing = (a, b) => screenRing([[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y], [a.x, a.y]]);
  const drawDraft = (coordinates) => map.getSource("draft")?.setData(coordinates ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} }] } : EMPTY);
  const sideRectangle = (point) => rectangleFromSide(toScreen(side[0]), toScreen(side[1]), [point.x, point.y]);
  const drawSide = (point) => drawDraft(screenRing(sideRectangle(point)));
  const tooFar = () => shown && zoomedOut();

  function cancelSide() {
    if (!side) return false;
    side = null;
    drawDraft(null);
    onSide(false);
    return true;
  }

  surface.addEventListener("mousedown", (event) => {
    const point = pointOf(event);
    if (event.button === 1 || (editing && space && event.button === 0)) {
      event.preventDefault();
      event.stopPropagation();
      drag = { pan: point };
      return;
    }
    if (editing && event.button === 0) {
      event.stopPropagation();
      drag = { start: point };
    }
  }, { capture: true });
  window.addEventListener("mousemove", (event) => {
    if (!drag && !side) return;
    const point = pointOf(event);
    pointer = point;
    if (!drag) {
      drawSide(point);
      return;
    }
    // A button released outside the window sends no mouseup here.
    if ((event.buttons & (drag.pan ? 4 | 1 : 1)) === 0) {
      drag = null;
      if (side) drawSide(point);
      else drawDraft(null);
      return;
    }
    if (drag.pan) {
      map.panBy([drag.pan.x - point.x, drag.pan.y - point.y], { animate: false });
      drag.pan = point;
      return;
    }
    if (side) drawSide(point);
    else if (rotated()) drawDraft([map.unproject([drag.start.x, drag.start.y]).toArray(), map.unproject([point.x, point.y]).toArray()]);
    else drawDraft(boxRing(drag.start, point));
  });
  window.addEventListener("mouseup", (event) => {
    if (!drag) return;
    const { start } = drag;
    drag = null;
    if (!start) return;
    const end = pointOf(event);
    if (side) {
      const rectangle = sideRectangle(end);
      cancelSide();
      const [, b, c] = rectangle;
      if (Math.hypot(b[0] - c[0], b[1] - c[1]) < DRAG_SCREEN_PIXELS) onDraw("thin");
      else onDraw(tooFar() ? null : screenRing(rectangle));
      return;
    }
    drawDraft(null);
    if (Math.hypot(end.x - start.x, end.y - start.y) < DRAG_SCREEN_PIXELS) {
      onSelect(map.queryRenderedFeatures([end.x, end.y], { layers: ["labels-fill"] }).map(({ properties }) => properties));
      return;
    }
    if (tooFar()) {
      onDraw(null);
      return;
    }
    if (rotated()) {
      side = [map.unproject([start.x, start.y]).toArray(), map.unproject([end.x, end.y]).toArray()];
      drawSide(end);
      onSide(true);
      return;
    }
    onDraw(boxRing(start, end));
  });
  map.on("move", () => {
    if (side && pointer && !drag) drawSide(pointer);
  });

  function setEditing(on) {
    editing = on;
    drag = null;
    side = null;
    drawDraft(null);
    space = false;
    if (on) map.dragPan.disable();
    else map.dragPan.enable();
    map.getCanvas().style.cursor = on ? "crosshair" : "";
    if (!on) showPicked(EMPTY);
  }

  function showPicked(geojson) {
    map.getSource("picked")?.setData(geojson);
  }

  // fitBounds runs only for a new project or tile list, so the map keeps its place between reviews.
  async function render(view) {
    const first = shown === null;
    map.resize();
    if (!layered) {
      await ready;
      layered = true;
      addLayers(map, view);
    }
    map.getSource("tiles").setData(view.grid);
    map.getSource("labels").setData(view.labels);
    for (const layer of ["labels-fill", "labels-line"]) map.setPaintProperty(layer, layer === "labels-fill" ? "fill-color" : "line-color", view.colour);
    if (imageryKey !== null && imageryKey !== view.key) {
      map.removeLayer("imagery");
      map.removeSource("imagery");
      addImagery(map, view);
      fadeTiles(map, view);
    }
    imageryKey = view.key;
    if (first || shown.key !== view.key) {
      map.setMaxZoom(shownZoom(view));
      map.fitBounds(bounds(view.grid.features), { padding: 40, animate: false });
    }
    shown = view;
    const feature = view.grid.features[view.selected];
    map.getSource("selected").setData(feature ? { type: "FeatureCollection", features: [feature] } : EMPTY);
  }

  // Updates run one after another, so the layers are added once, and a failed update doesn't stop later ones.
  let pending = Promise.resolve();
  function show(view) {
    pending = pending.then(() => render(view), () => render(view));
    return pending;
  }

  return { show, setEditing, showPicked, cancelSide };
}
