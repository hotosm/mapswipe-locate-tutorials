// At 4 times on a laptop, each pixel of the 1,024-pixel tile image is about 3 screen pixels wide.
const MAX_SCALE = 4;

// The tile zooms with a CSS transform on `view`; getBoundingClientRect follows the transform, so tap positions stay right (https://drafts.csswg.org/cssom-view/#dom-element-getboundingclientrect).
export function createTileZoom(stage, view, onChange) {
  let scale = 1;
  let x = 0;
  let y = 0;
  let pan = null;
  let space = false;
  let drawnScale = 1;

  function apply() {
    x = Math.min(0, Math.max(stage.clientWidth * (1 - scale), x));
    y = Math.min(0, Math.max(stage.clientHeight * (1 - scale), y));
    view.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (scale === drawnScale) return;
    drawnScale = scale;
    onChange(scale);
  }

  function zoomAt(factor, clientX, clientY) {
    const { left, top } = stage.getBoundingClientRect();
    const next = Math.min(MAX_SCALE, Math.max(1, scale * factor));
    x = clientX - left - (clientX - left - x) * (next / scale);
    y = clientY - top - (clientY - top - y) * (next / scale);
    scale = next;
    apply();
  }

  function zoomCentre(factor) {
    const { left, top, width, height } = stage.getBoundingClientRect();
    zoomAt(factor, left + width / 2, top + height / 2);
  }

  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
  }, { passive: false });

  // A plain drag labels, so Space or the middle button moves the zoomed tile; capture stops the drag before it reaches the labelling canvas.
  stage.addEventListener("pointerdown", (event) => {
    if (scale === 1 || !(space || event.button === 1)) return;
    event.stopPropagation();
    event.preventDefault();
    pan = { left: event.clientX - x, top: event.clientY - y };
    stage.setPointerCapture(event.pointerId);
  }, { capture: true });
  stage.addEventListener("pointermove", (event) => {
    if (!pan) return;
    event.stopPropagation();
    x = event.clientX - pan.left;
    y = event.clientY - pan.top;
    apply();
  }, { capture: true });
  stage.addEventListener("pointerup", (event) => {
    if (!pan) return;
    event.stopPropagation();
    pan = null;
  }, { capture: true });
  for (const type of ["pointercancel", "lostpointercapture"]) stage.addEventListener(type, () => { pan = null; }, { capture: true });

  // While zoomed, Space is kept for moving, so it doesn't also press a focused button or scroll the page.
  const typing = 'input:not([type="radio"]):not([type="checkbox"]), select, textarea';
  for (const type of ["keydown", "keyup"]) {
    document.addEventListener(type, (event) => {
      if (event.key !== " " || event.target.closest(typing)) return;
      if (scale > 1) event.preventDefault();
      space = type === "keydown";
    });
  }

  // A Space released in another window never sends keyup here.
  window.addEventListener("blur", () => { space = false; });

  function reset() {
    scale = 1;
    x = 0;
    y = 0;
    apply();
  }

  return { reset, zoomIn: () => zoomCentre(1.5), zoomOut: () => zoomCentre(1 / 1.5) };
}
