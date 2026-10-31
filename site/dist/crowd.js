/**
 * An exact, virtual crowd. The grid is represented by a complete-row rectangle
 * and one partial row, rather than an array with an entry for every person.
 */
export const CELL_WIDTH = 12;
export const CELL_HEIGHT = 24;

const INK = '#c97854';
const HIGHLIGHT = '#353b34';
const PAD = 28;
const MAX_SCALE = 8;
const MAX_FIT_SCALE = 3.5;

export function validateCount(count) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Enter a whole number from 0 to 9,007,199,254,740,991.');
  }
  return count;
}

export function getLayout(count, width, height) {
  validateCount(count);
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('The viewport dimensions must be positive finite numbers.');
  }
  if (count === 0) {
    return { columns: 0, rows: 0, fullRows: 0, remainder: 0, worldWidth: 0, worldHeight: 0 };
  }
  const columns = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * (width / height) * (CELL_HEIGHT / CELL_WIDTH)))));
  const total = BigInt(count);
  const divisor = BigInt(columns);
  const fullRows = Number(total / divisor);
  const remainder = Number(total % divisor);
  const rows = fullRows + (remainder > 0 ? 1 : 0);
  return { columns, rows, fullRows, remainder, worldWidth: columns * CELL_WIDTH, worldHeight: rows * CELL_HEIGHT };
}

/** Returns the exact, one-based person index for a grid coordinate. */
export function personAt(layout, count, column, row) {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= layout.columns || row >= layout.rows) return null;
  const index = BigInt(row) * BigInt(layout.columns) + BigInt(column) + 1n;
  return index <= BigInt(count) ? Number(index) : null;
}

function drawPerson(context, color = INK) {
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.arc(6, 4.3, 1.6, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(4.5, 7.1);
  context.quadraticCurveTo(6, 6.5, 7.5, 7.1);
  context.lineTo(7.5, 13.8);
  context.lineTo(4.5, 13.8);
  context.closePath();
  context.fill();
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(4.4, 7.7);
  context.lineTo(3.25, 13.1);
  context.moveTo(7.6, 7.7);
  context.lineTo(8.75, 13.1);
  context.stroke();
  context.lineWidth = 1.85;
  context.beginPath();
  context.moveTo(5.1, 13.2);
  context.lineTo(4.8, 20.5);
  context.moveTo(6.9, 13.2);
  context.lineTo(7.2, 20.5);
  context.stroke();
}

export function createCrowd(canvas, { onViewChange = () => {}, onInspect = () => {} } = {}) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('This browser cannot draw the crowd. Please use a browser with Canvas support.');
  let count = 0;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let layout = getLayout(0, width, height);
  let fitScale = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let frame = 0;
  let destroyed = false;
  let hovered = null;
  let hoverPoint = null;
  const pointers = new Map();
  let pinchDistance = null;
  let lastPinchCenter = null;
  let pattern = null;
  let tileResolution = 0;
  let inkCoverage = 0.23;
  const originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  function getState() {
    return {
      count,
      zoom: scale / fitScale,
      isFit: Math.abs(scale / fitScale - 1) < 0.001,
      individualSize: CELL_WIDTH * scale,
      density: CELL_WIDTH * scale * dpr < 1,
      columns: layout.columns,
      rows: layout.rows,
      remainder: layout.remainder,
      fullRows: layout.fullRows,
      scale,
      offsetX,
      offsetY,
      width,
      height,
    };
  }

  function emit() {
    if (!destroyed) onViewChange(getState());
  }

  function requestDraw() {
    if (!frame && !destroyed) frame = requestAnimationFrame(draw);
  }

  function center() {
    offsetX = (width - layout.worldWidth * scale) / 2;
    offsetY = (height - layout.worldHeight * scale) / 2;
  }

  function clampPan() {
    const extentX = layout.worldWidth * scale;
    const extentY = layout.worldHeight * scale;
    const marginX = Math.min(PAD, width / 4);
    const marginY = Math.min(PAD, height / 4);
    offsetX = extentX <= width - marginX * 2 ? (width - extentX) / 2 : Math.max(width - marginX - extentX, Math.min(marginX, offsetX));
    offsetY = extentY <= height - marginY * 2 ? (height - extentY) / 2 : Math.max(height - marginY - extentY, Math.min(marginY, offsetY));
  }

  function updateFitScale() {
    fitScale = count ? Math.min(MAX_FIT_SCALE, Math.max(1, width - PAD * 2) / layout.worldWidth, Math.max(1, height - PAD * 2) / layout.worldHeight) : 1;
  }

  function fit() {
    scale = fitScale;
    center();
    clearHover();
    emit();
    requestDraw();
  }

  function setCount(nextCount) {
    validateCount(nextCount);
    count = nextCount;
    layout = getLayout(count, Math.max(1, width - PAD * 2), Math.max(1, height - PAD * 2));
    updateFitScale();
    fit();
  }

  function clearHover() {
    if (hovered !== null || hoverPoint !== null) {
      hovered = null;
      hoverPoint = null;
      onInspect(null);
      requestDraw();
    }
  }

  function buildPattern() {
    const resolution = Math.max(3, Math.min(12, Math.ceil(scale * dpr)));
    if (pattern && resolution === tileResolution) return;
    tileResolution = resolution;
    const tile = document.createElement('canvas');
    tile.width = CELL_WIDTH * resolution;
    tile.height = CELL_HEIGHT * resolution;
    const tileContext = tile.getContext('2d');
    tileContext.scale(resolution, resolution);
    drawPerson(tileContext);
    const pixels = tileContext.getImageData(0, 0, tile.width, tile.height).data;
    let alpha = 0;
    for (let index = 3; index < pixels.length; index += 4) alpha += pixels[index];
    inkCoverage = alpha / (255 * tile.width * tile.height);
    pattern = context.createPattern(tile, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(1 / resolution));
  }

  function paintRectangle(left, top, rectWidth, rectHeight) {
    // Clip in CSS-pixel coordinates before drawing. This prevents giant canvas
    // paths and preserves stable precision near the far end of enormous grids.
    const x0 = Math.max(0, offsetX + left * scale);
    const y0 = Math.max(0, offsetY + top * scale);
    const x1 = Math.min(width, offsetX + (left + rectWidth) * scale);
    const y1 = Math.min(height, offsetY + (top + rectHeight) * scale);
    if (x1 <= x0 || y1 <= y0) return;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  function draw() {
    frame = 0;
    if (destroyed) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!count) return;
    buildPattern();
    context.save();
    if (CELL_WIDTH * scale * dpr < 1) {
      // At subpixel scale a silhouette cannot be individually resolved. Draw
      // its measured average ink coverage over the exact occupied rectangles;
      // this is area integration, never a reduced or sampled population.
      context.globalAlpha = inkCoverage;
      context.fillStyle = INK;
    } else {
      pattern.setTransform(new DOMMatrix().translate(offsetX, offsetY).scale(scale / tileResolution));
      context.fillStyle = pattern;
    }
    if (layout.fullRows) paintRectangle(0, 0, layout.worldWidth, layout.fullRows * CELL_HEIGHT);
    if (layout.remainder) paintRectangle(0, layout.fullRows * CELL_HEIGHT, layout.remainder * CELL_WIDTH, CELL_HEIGHT);
    context.restore();
    if (hovered !== null && CELL_WIDTH * scale >= 5) {
      const zeroIndex = BigInt(hovered - 1);
      const column = Number(zeroIndex % BigInt(layout.columns));
      const row = Number(zeroIndex / BigInt(layout.columns));
      context.save();
      context.translate(offsetX + column * CELL_WIDTH * scale, offsetY + row * CELL_HEIGHT * scale);
      context.scale(scale, scale);
      context.clearRect(0, 0, CELL_WIDTH, CELL_HEIGHT);
      drawPerson(context, HIGHLIGHT);
      context.restore();
    }
  }

  function zoomTo(nextScale, x = width / 2, y = height / 2) {
    if (!count) return;
    nextScale = Math.max(fitScale, Math.min(MAX_SCALE, nextScale));
    const ratio = nextScale / scale;
    offsetX = x - (x - offsetX) * ratio;
    offsetY = y - (y - offsetY) * ratio;
    scale = nextScale;
    clampPan();
    clearHover();
    emit();
    requestDraw();
  }

  function focusPerson() {
    if (!count) return;
    // Center a real person rather than the potentially unoccupied last cell.
    const index = BigInt(Math.floor((count - 1) / 2));
    const column = Number(index % BigInt(layout.columns));
    const row = Number(index / BigInt(layout.columns));
    scale = Math.max(fitScale, 2.5);
    offsetX = width / 2 - (column + 0.5) * CELL_WIDTH * scale;
    offsetY = height / 2 - (row + 0.5) * CELL_HEIGHT * scale;
    clampPan();
    clearHover();
    emit();
    requestDraw();
  }

  function position(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function inspect(point) {
    if (!count || CELL_WIDTH * scale < 5 || pointers.size) {
      clearHover();
      return;
    }
    const column = Math.floor((point.x - offsetX) / (CELL_WIDTH * scale));
    const row = Math.floor((point.y - offsetY) / (CELL_HEIGHT * scale));
    const next = personAt(layout, count, column, row);
    if (hovered !== next) {
      hovered = next;
      requestDraw();
    }
    hoverPoint = next === null ? null : point;
    onInspect(next === null ? null : { index: next, x: point.x, y: point.y });
  }

  function wheel(event) {
    event.preventDefault();
    const point = position(event);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    zoomTo(scale * Math.exp(Math.max(-1, Math.min(1, -delta * 0.002))), point.x, point.y);
  }

  function updatePinch() {
    if (pointers.size < 2) {
      pinchDistance = null;
      lastPinchCenter = null;
      return null;
    }
    const [first, second] = [...pointers.values()];
    return { distance: Math.hypot(second.x - first.x, second.y - first.y), center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } };
  }

  function pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, position(event));
    canvas.style.cursor = 'grabbing';
    clearHover();
    const pinch = updatePinch();
    if (pinch) {
      pinchDistance = pinch.distance;
      lastPinchCenter = pinch.center;
    }
  }

  function pointerMove(event) {
    const point = position(event);
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      inspect(point);
      return;
    }
    pointers.set(event.pointerId, point);
    const pinch = updatePinch();
    if (pinch && pinchDistance !== null) {
      if (lastPinchCenter) {
        offsetX += pinch.center.x - lastPinchCenter.x;
        offsetY += pinch.center.y - lastPinchCenter.y;
      }
      if (pinchDistance > 0) zoomTo(scale * pinch.distance / pinchDistance, pinch.center.x, pinch.center.y);
      pinchDistance = pinch.distance;
      lastPinchCenter = pinch.center;
    } else {
      offsetX += point.x - previous.x;
      offsetY += point.y - previous.y;
      clampPan();
      emit();
      requestDraw();
    }
  }

  function pointerEnd(event) {
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    updatePinch();
    if (!pointers.size) {
      canvas.style.cursor = 'grab';
      if (event.pointerType === 'mouse') inspect(position(event));
    }
  }

  function doubleClick(event) {
    const point = position(event);
    zoomTo(scale * (event.shiftKey ? 0.5 : 2), point.x, point.y);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const wasFit = Math.abs(scale / fitScale - 1) < 0.001;
    const oldWidth = width;
    const oldHeight = height;
    const oldFitScale = fitScale;
    width = bounds.width;
    height = bounds.height;
    dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (wasFit) layout = getLayout(count, Math.max(1, width - PAD * 2), Math.max(1, height - PAD * 2));
    updateFitScale();
    if (wasFit) {
      scale = fitScale;
      center();
    } else {
      offsetX += (width - oldWidth) / 2;
      offsetY += (height - oldHeight) / 2;
      if (scale < fitScale || oldFitScale === 0) scale = fitScale;
      clampPan();
    }
    clearHover();
    emit();
    requestDraw();
  }

  const listeners = [
    ['wheel', wheel, { passive: false }],
    ['pointerdown', pointerDown],
    ['pointermove', pointerMove],
    ['pointerup', pointerEnd],
    ['pointercancel', pointerEnd],
    ['lostpointercapture', pointerEnd],
    ['pointerleave', clearHover],
    ['dblclick', doubleClick],
  ];
  for (const [event, handler, options] of listeners) canvas.addEventListener(event, handler, options);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize);
  canvas.style.cursor = 'grab';
  resize();

  function destroy() {
    destroyed = true;
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', resize);
    for (const [event, handler, options] of listeners) canvas.removeEventListener(event, handler, options);
    pointers.clear();
    canvas.style.touchAction = originalTouchAction;
    canvas.style.cursor = '';
  }

  return { setCount, zoomIn: () => zoomTo(scale * 1.6), zoomOut: () => zoomTo(scale / 1.6), fit, focusPerson, getState, destroy };
}
