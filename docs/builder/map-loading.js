// MapLibre fires dataloading when it starts fetching a tile or source and idle once everything is drawn.
export function showMapLoading(map) {
  const badge = document.createElement("div");
  badge.className = "map-loading";
  badge.textContent = "Loading map...";
  badge.hidden = true;
  badge.setAttribute("role", "status");
  map.getContainer().append(badge);
  map.on("dataloading", () => { badge.hidden = false; });
  map.on("idle", () => { badge.hidden = true; });
}
