/**
 * state.js
 * Single source of truth for all user-configurable simulation parameters.
 *
 * All subsystems read from this module rather than keeping their own copies.
 * Mutation is done through the set* helpers, which notify registered listeners
 * so UI components can react without being tightly coupled.
 *
 * Parameters managed here:
 *  - locationKey / dataset (active NSRDB dataset)
 *  - month (1-12)
 *  - tiltDeg / azimuthDeg / tracking
 *  - currentHour (for 3D scene / snapshot card)
 */

/** Current simulation state */
export const state = {
  locationKey:  "phoenix",
  dataset:      null,       // parsed NSRDB dataset (set after load)
  tracking:     false,
  tiltDeg:      25,
  azimuthDeg:   180,
  month:        6,
  currentHour:  12,
};

/** Registered change listeners: Map<string, Set<fn>> */
const listeners = new Map();

/**
 * Register a callback to fire when a state key changes.
 * Returns an unsubscribe function.
 *
 *  keys — array of state key strings, or '*' for all changes
 *  fn   — callback(changedKey, newValue, fullState)
 */
export function subscribe(keys, fn) {
  const ks = keys === "*" ? ["*"] : (Array.isArray(keys) ? keys : [keys]);
  ks.forEach(k => {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k).add(fn);
  });
  return () => ks.forEach(k => listeners.get(k)?.delete(fn));
}

function notify(key, value) {
  listeners.get(key)?.forEach(fn => fn(key, value, state));
  listeners.get("*")?.forEach(fn => fn(key, value, state));
}

/** Batch-set multiple keys, firing one '*' notification at the end */
export function setState(patch) {
  Object.assign(state, patch);
  Object.keys(patch).forEach(k => notify(k, state[k]));
}

export function setLocation(key, dataset) {
  state.locationKey = key;
  state.dataset     = dataset;
  notify("locationKey", key);
  notify("dataset", dataset);
}

export function setMonth(m) {
  state.month = m;
  notify("month", m);
}

export function setOrientation(tiltDeg, azimuthDeg) {
  state.tiltDeg     = tiltDeg;
  state.azimuthDeg  = azimuthDeg;
  notify("tiltDeg", tiltDeg);
  notify("azimuthDeg", azimuthDeg);
}

export function setTracking(enabled) {
  state.tracking = enabled;
  notify("tracking", enabled);
}

export function setHour(h) {
  state.currentHour = h;
  notify("currentHour", h);
}