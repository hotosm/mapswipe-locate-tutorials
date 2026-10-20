const IMAGE_ID = /(?:selected_id=|\/items\/)([0-9a-f]{24}|[0-9a-f-]{36})|^([0-9a-f]{24}|[0-9a-f-]{36})$/;

export function parseImageId(text) {
  const match = text.trim().match(IMAGE_ID);
  if (!match) throw new Error("Paste an imagery.hotosm.org link, a Copy TMS URL or an image ID.");
  return match[1] ?? match[2];
}

// Drone mosaics pad their edges with white or black, which is not imagery.
export function isEmptyPixel(red, green, blue, alpha) {
  if (alpha === 0) return true;
  const bright = red >= 245 && green >= 245 && blue >= 245;
  const dark = red <= 10 && green <= 10 && blue <= 10;
  return bright || dark;
}

export function imageryMask(rgba, width, height) {
  const mask = new Float64Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    mask[index] = isEmptyPixel(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]) ? 0 : 1;
  }
  return mask;
}

// The preview covers the image bounds in EPSG:4326, so pixels map linearly to degrees.
export function pixelToLonLat([west, south, east, north], width, height) {
  return ([x, y]) => [west + (x / width) * (east - west), north - (y / height) * (north - south)];
}

function tileX(longitude, zoom) {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom);
}

function tileY(latitude, zoom) {
  const radians = (latitude * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom);
}

// An estimate: MapSwipe groups tiles in strips three rows tall and an even number of columns wide.
export function tileCount([west, south, east, north], zoom) {
  const columns = tileX(east, zoom) - tileX(west, zoom) + 1;
  const rows = tileY(south, zoom) - tileY(north, zoom) + 1;
  return (columns + (columns % 2)) * Math.ceil(rows / 3) * 3;
}
