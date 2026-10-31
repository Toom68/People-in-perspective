import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrowd, CELL_WIDTH, CELL_HEIGHT } from '../dist/crowd.js';

// These are browser API test doubles, not a browser or a pixel renderer. They
// exercise the real public controller and its event listeners in Node.
class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, properties = {}) {
    const event = {
      pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0,
      deltaY: 0, deltaMode: 0, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

class Matrix {
  translate() { return this; }
  scale() { return this; }
}

function contextDouble() {
  return {
    fills: [], clears: [], patterns: [],
    setTransform() {}, scale() {}, translate() {}, save() {}, restore() {},
    beginPath() {}, closePath() {}, arc() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, fill() {}, stroke() {},
    clearRect(...rectangle) { this.clears.push(rectangle); },
    fillRect(...rectangle) { this.fills.push(rectangle); },
    createPattern() {
      const pattern = { setTransform() {} };
      this.patterns.push(pattern);
      return pattern;
    },
    getImageData(_x, _y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 3; index < data.length; index += 4) data[index] = 64;
      return { data };
    },
  };
}

function canvasDouble(width = 960, height = 400) {
  const canvas = new Events();
  canvas.style = { touchAction: 'pan-y', cursor: '' };
  canvas.bounds = { left: 40, top: 70, width, height };
  canvas.context = contextDouble();
  canvas.captures = new Set();
  canvas.getContext = () => canvas.context;
  canvas.getBoundingClientRect = () => ({ ...canvas.bounds });
  canvas.setPointerCapture = id => canvas.captures.add(id);
  canvas.hasPointerCapture = id => canvas.captures.has(id);
  canvas.releasePointerCapture = id => canvas.captures.delete(id);
  return canvas;
}

function harness(t, { width = 960, height = 400, dpr = 1 } = {}) {
  const names = ['window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMMatrix'];
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map();
  const observers = [];
  let nextFrame = 0;
  const window = Object.assign(new Events(), { devicePixelRatio: dpr });
  const canvas = canvasDouble(width, height);
  const states = [];
  const inspections = [];
  Object.assign(globalThis, {
    window,
    document: { createElement: type => { assert.equal(type, 'canvas'); return canvasDouble(); } },
    DOMMatrix: Matrix,
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      disconnected = false;
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
      trigger() { if (!this.disconnected) this.callback(); }
    },
  });
  const crowd = createCrowd(canvas, {
    onViewChange: state => states.push(state),
    onInspect: info => inspections.push(info),
  });
  t.after(() => {
    crowd.destroy();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return {
    canvas, window, crowd, states, inspections, frames, observers,
    flush() {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback();
    },
    point(x, y) { return { clientX: x + canvas.bounds.left, clientY: y + canvas.bounds.top }; },
    resize(nextWidth, nextHeight) {
      canvas.bounds.width = nextWidth;
      canvas.bounds.height = nextHeight;
      for (const observer of observers) observer.trigger();
    },
  };
}

function close(actual, expected, message, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function worldPoint(state, x, y) {
  return { x: (x - state.offsetX) / state.scale, y: (y - state.offsetY) / state.scale };
}

function assertExact(state) {
  assert.equal(BigInt(state.fullRows) * BigInt(state.columns) + BigInt(state.remainder), BigInt(state.count));
}

test('setCount accepts exact populations, fits each crowd, and rejects invalid changes atomically', t => {
  const h = harness(t);
  for (const count of [1, 999, 100000, 1000000000, Number.MAX_SAFE_INTEGER]) {
    h.crowd.setCount(count);
    const state = h.crowd.getState();
    assert.equal(state.count, count);
    assert.equal(h.states.at(-1).count, count);
    assert.equal(state.isFit, true);
    assertExact(state);
    assert.ok(state.offsetX >= -1e-6 && state.offsetY >= -1e-6);
    assert.ok(state.offsetX + state.columns * CELL_WIDTH * state.scale <= state.width + 1e-6);
    assert.ok(state.offsetY + state.rows * CELL_HEIGHT * state.scale <= state.height + 1e-6);
  }
  const previous = h.crowd.getState();
  for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    assert.throws(() => h.crowd.setCount(count), RangeError);
    assert.deepEqual(h.crowd.getState(), previous);
  }
});

test('zero clears the old crowd and all zoom and focus operations remain safe', t => {
  const h = harness(t);
  h.crowd.setCount(1000);
  h.flush();
  assert.ok(h.canvas.context.fills.length > 0);
  h.crowd.setCount(0);
  h.canvas.context.fills.length = 0;
  const before = h.crowd.getState();
  h.crowd.zoomIn();
  h.crowd.zoomOut();
  h.crowd.focusPerson();
  h.flush();
  assert.deepEqual(h.crowd.getState(), before);
  assert.equal(before.count, 0);
  assert.equal(before.columns, 0);
  assert.equal(before.rows, 0);
  assert.equal(h.canvas.context.fills.length, 0);
  assert.deepEqual(h.canvas.context.clears.at(-1), [0, 0, before.width, before.height]);
});

test('focus reveals real individual people in huge crowds and fit restores the whole crowd', t => {
  const h = harness(t);
  for (const count of [1000000000, Number.MAX_SAFE_INTEGER]) {
    h.crowd.setCount(count);
    const fitted = h.crowd.getState();
    assert.equal(fitted.density, true);
    h.crowd.focusPerson();
    const focused = h.crowd.getState();
    assert.equal(focused.count, count);
    assert.equal(focused.density, false);
    assert.ok(focused.individualSize >= 24);
    const center = worldPoint(focused, focused.width / 2, focused.height / 2);
    const column = BigInt(Math.floor(center.x / CELL_WIDTH));
    const row = BigInt(Math.floor(center.y / CELL_HEIGHT));
    const index = row * BigInt(focused.columns) + column + 1n;
    assert.ok(index >= 1n && index <= BigInt(count));
    h.crowd.fit();
    assert.deepEqual(h.crowd.getState(), fitted);
  }
});

test('zoom buttons change scale without changing count and cannot zoom beyond the fitted overview', t => {
  const h = harness(t);
  h.crowd.setCount(100000);
  const fitted = h.crowd.getState();
  h.crowd.zoomIn();
  const zoomed = h.crowd.getState();
  assert.ok(zoomed.scale > fitted.scale);
  assert.equal(zoomed.isFit, false);
  assert.equal(zoomed.count, 100000);
  h.crowd.zoomOut();
  close(h.crowd.getState().scale, fitted.scale, 'Zoom in/out returns to fitted scale');
  for (let step = 0; step < 20; step++) h.crowd.zoomOut();
  assert.equal(h.crowd.getState().isFit, true);
  close(h.crowd.getState().scale, fitted.scale, 'Overview remains the minimum scale');
});

test('wheel zoom anchors the same crowd location beneath the pointer', t => {
  const h = harness(t);
  h.crowd.setCount(1000000);
  h.crowd.focusPerson();
  const before = h.crowd.getState();
  const point = { x: 350, y: 145 };
  const anchor = worldPoint(before, point.x, point.y);
  const event = h.canvas.dispatch('wheel', { ...h.point(point.x, point.y), deltaY: -100 });
  const after = h.crowd.getState();
  assert.equal(event.defaultPrevented, true);
  assert.ok(after.scale > before.scale);
  const nextAnchor = worldPoint(after, point.x, point.y);
  close(nextAnchor.x, anchor.x, 'Horizontal wheel anchor');
  close(nextAnchor.y, anchor.y, 'Vertical wheel anchor');
  assert.equal(after.count, before.count);
});

test('pointer dragging pans the crowd and capture ends on pointer release', t => {
  const h = harness(t);
  h.crowd.setCount(1000000);
  h.crowd.focusPerson();
  const before = h.crowd.getState();
  h.canvas.dispatch('pointerdown', h.point(300, 150));
  assert.equal(h.canvas.hasPointerCapture(1), true);
  h.canvas.dispatch('pointermove', h.point(380, 195));
  const after = h.crowd.getState();
  close(after.offsetX, before.offsetX + 80, 'Horizontal drag movement');
  close(after.offsetY, before.offsetY + 45, 'Vertical drag movement');
  assert.equal(after.scale, before.scale);
  assert.equal(after.count, before.count);
  h.canvas.dispatch('pointerup', h.point(380, 195));
  assert.equal(h.canvas.hasPointerCapture(1), false);
  assert.equal(h.canvas.style.cursor, 'grab');
});

test('pinching increases scale while keeping the original midpoint under the moving midpoint', t => {
  const h = harness(t);
  h.crowd.setCount(1000000);
  h.crowd.focusPerson();
  const before = h.crowd.getState();
  const anchor = worldPoint(before, 400, 200);
  h.canvas.dispatch('pointerdown', { ...h.point(300, 200), pointerId: 1, pointerType: 'touch' });
  h.canvas.dispatch('pointerdown', { ...h.point(500, 200), pointerId: 2, pointerType: 'touch' });
  h.canvas.dispatch('pointermove', { ...h.point(600, 200), pointerId: 2, pointerType: 'touch' });
  const after = h.crowd.getState();
  close(after.scale / before.scale, 1.5, 'Pinch scale ratio');
  const movedAnchor = worldPoint(after, 450, 200);
  close(movedAnchor.x, anchor.x, 'Pinch horizontal anchor');
  close(movedAnchor.y, anchor.y, 'Pinch vertical anchor');
  assert.equal(after.count, before.count);
});

test('hover reports exact first and last indexes without inventing people in the partial row', t => {
  const h = harness(t);
  h.crowd.setCount(999);
  const state = h.crowd.getState();
  assert.ok(state.remainder > 0);
  const atCell = (column, row) => h.point(
    state.offsetX + (column + 0.5) * CELL_WIDTH * state.scale,
    state.offsetY + (row + 0.5) * CELL_HEIGHT * state.scale,
  );
  h.canvas.dispatch('pointermove', atCell(0, 0));
  assert.equal(h.inspections.at(-1).index, 1);
  const last = BigInt(state.count) - 1n;
  h.canvas.dispatch('pointermove', atCell(Number(last % BigInt(state.columns)), Number(last / BigInt(state.columns))));
  assert.equal(h.inspections.at(-1).index, 999);
  h.canvas.dispatch('pointermove', atCell(state.remainder, state.fullRows));
  assert.equal(h.inspections.at(-1), null);
  h.canvas.dispatch('pointermove', atCell(0, 0));
  h.canvas.dispatch('pointerleave');
  assert.equal(h.inspections.at(-1), null);
});

test('fitted crowds reflow to phone dimensions and render at the device pixel ratio', t => {
  const h = harness(t, { dpr: 2 });
  h.crowd.setCount(100000);
  h.resize(320, 500);
  const state = h.crowd.getState();
  assert.equal(state.width, 320);
  assert.equal(state.height, 500);
  assert.equal(h.canvas.width, 640);
  assert.equal(h.canvas.height, 1000);
  assert.equal(state.isFit, true);
  assert.equal(state.count, 100000);
  assertExact(state);
  assert.ok(state.offsetX >= 0 && state.offsetY >= 0);
  assert.ok(state.offsetX + state.columns * CELL_WIDTH * state.scale <= 320 + 1e-6);
  assert.ok(state.offsetY + state.rows * CELL_HEIGHT * state.scale <= 500 + 1e-6);
});

test('resizing a zoomed crowd retains the same center location', t => {
  const h = harness(t);
  h.crowd.setCount(1000000);
  h.crowd.focusPerson();
  const before = h.crowd.getState();
  const center = worldPoint(before, before.width / 2, before.height / 2);
  h.resize(480, 600);
  const after = h.crowd.getState();
  const nextCenter = worldPoint(after, after.width / 2, after.height / 2);
  close(nextCenter.x, center.x, 'Resized horizontal center');
  close(nextCenter.y, center.y, 'Resized vertical center');
  assert.equal(after.scale, before.scale);
  assert.equal(after.count, before.count);
  assert.equal(after.columns, before.columns);
});

test('large crowds paint a bounded number of rectangles and batch changes into one animation frame', t => {
  const h = harness(t);
  h.flush();
  h.canvas.context.fills.length = 0;
  for (const count of [1000, 100000, 1000000000, Number.MAX_SAFE_INTEGER]) h.crowd.setCount(count);
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.ok(h.canvas.context.fills.length >= 1 && h.canvas.context.fills.length <= 2);
  assert.equal(h.frames.size, 0);
  assert.equal(h.crowd.getState().count, Number.MAX_SAFE_INTEGER);
});

test('destroy disconnects listeners, observer, pending paint and restores touch scrolling', t => {
  const h = harness(t);
  h.crowd.setCount(100000);
  assert.ok(h.canvas.listenerCount > 0);
  assert.ok(h.window.listenerCount > 0);
  assert.ok(h.frames.size > 0);
  h.crowd.destroy();
  assert.equal(h.canvas.listenerCount, 0);
  assert.equal(h.window.listenerCount, 0);
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.disconnected));
  assert.equal(h.canvas.style.touchAction, 'pan-y');
  const before = h.crowd.getState();
  const callbacks = h.states.length;
  h.canvas.dispatch('wheel', { ...h.point(200, 200), deltaY: -100 });
  h.resize(320, 500);
  assert.deepEqual(h.crowd.getState(), before);
  assert.equal(h.states.length, callbacks);
});
