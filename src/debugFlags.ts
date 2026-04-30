// debugFlags.ts
//
// Independent persistent debug toggles. Each one has a `?debug=<name>` query
// seed (comma-separated for multiple) and its own localStorage key. Toggling
// from the in-app speed-dial UI updates both. All flags share one listener
// pool so any change re-renders any subscriber.
//
//   hitboxes              — wireframe boxes around clickable hotspots/toys
//   barrel-roll-triggers  — wireframe spheres at FlightPath roll triggers
//
// Lighting is tuned through the leva panel (top-right of the canvas), not
// a debug toggle.

import { useSyncExternalStore } from "react";

const STORAGE_HITBOXES = "sakhalteam.debug.hitboxes";
const STORAGE_BARREL = "sakhalteam.debug.barrelRollTriggers";

type Listener = () => void;

function queryEnables(name: string): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const set = new Set(
    (params.get("debug") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return set.has(name);
}

function readStored(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "true";
}

function writeStored(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

let debugHitboxes = queryEnables("hitboxes") || readStored(STORAGE_HITBOXES);
let debugBarrelRollTriggers =
  queryEnables("barrel-roll-triggers") || readStored(STORAGE_BARREL);

const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getDebugHitboxes() {
  return debugHitboxes;
}

export function setDebugHitboxes(next: boolean) {
  if (debugHitboxes === next) return;
  debugHitboxes = next;
  writeStored(STORAGE_HITBOXES, next);
  emit();
}

export function getDebugBarrelRollTriggers() {
  return debugBarrelRollTriggers;
}

export function setDebugBarrelRollTriggers(next: boolean) {
  if (debugBarrelRollTriggers === next) return;
  debugBarrelRollTriggers = next;
  writeStored(STORAGE_BARREL, next);
  emit();
}

export function subscribeDebugFlags(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDebugHitboxes() {
  return useSyncExternalStore(
    subscribeDebugFlags,
    getDebugHitboxes,
    () => false,
  );
}

export function useDebugBarrelRollTriggers() {
  return useSyncExternalStore(
    subscribeDebugFlags,
    getDebugBarrelRollTriggers,
    () => false,
  );
}

/** Backwards-compatible snapshot for non-React call sites. Prefer the
 * hooks inside components that need to update live. */
export const DEBUG_HITBOXES = getDebugHitboxes();
