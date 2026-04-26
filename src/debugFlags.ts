// debugFlags.ts
//
// Tiny persistent debug toggles. Query string still seeds the initial value
// (`?debug=hitboxes`), but the in-app toggle can switch it without navigation.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "sakhalteam.debug.hitboxes";

type Listener = () => void;

function queryEnablesHitboxes() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return new Set(
    (params.get("debug") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ).has("hitboxes");
}

function readStoredHitboxes() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

let debugHitboxes =
  queryEnablesHitboxes() || readStoredHitboxes();

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
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }
  emit();
}

export function toggleDebugHitboxes() {
  setDebugHitboxes(!debugHitboxes);
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

/** Backwards-compatible snapshot for non-React call sites. Prefer
 * useDebugHitboxes() inside components that need to update live. */
export const DEBUG_HITBOXES = getDebugHitboxes();
