import { useSyncExternalStore } from 'react'

// ── Transition phases ──────────────────────────────────────
// idle       → nothing happening
// clouds-in  → clouds sliding to cover screen
// holding    → clouds fully covering, waiting for new scene
// clouds-out → clouds parting, revealing new scene

export type TransitionPhase = 'idle' | 'clouds-in' | 'holding' | 'clouds-out'

let _phase: TransitionPhase = 'idle'
let _url = ''
let _internal = true
const _listeners = new Set<() => void>()

function emit() {
  _listeners.forEach(fn => fn())
}

export function subscribeTransition(listener: () => void) {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

export function getTransitionPhase() {
  return _phase
}

export function getTransitionTarget() {
  return { url: _url, internal: _internal }
}

/** Kick off the cloud transition (called by zone/portal click handlers) */
export function startTransition(url: string, internal: boolean) {
  if (_phase !== 'idle') return
  _url = url
  _internal = internal
  _phase = 'clouds-in'
  emit()
}

/** Clouds fully cover the screen — time to navigate (called by CloudTransition) */
export function cloudsFullyCovered() {
  _phase = 'holding'
  emit()
}

/** New scene is loaded and ready — start parting the clouds (called by useSceneTransition) */
export function sceneReady() {
  if (_phase !== 'holding') return
  _phase = 'clouds-out'
  emit()
}

/** Clouds have fully parted — back to normal (called by CloudTransition) */
export function cloudsFullyCleared() {
  _phase = 'idle'
  _url = ''
  emit()
}

/** React hook — subscribe to the current transition phase */
export function useTransitionPhase() {
  return useSyncExternalStore(subscribeTransition, getTransitionPhase)
}
