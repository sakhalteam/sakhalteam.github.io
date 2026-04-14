/**
 * Coordination flag between ToyInteractor and ZoneHitbox.
 *
 * ToyInteractor sets this on capture-phase pointerdown when a toy mesh
 * is under the cursor. ZoneHitbox checks it in its R3F onClick to bail
 * out, preventing zone navigation when a toy was clicked.
 *
 * Lives in its own module so ToyInteractor.tsx only exports React
 * components — required by Vite's Fast Refresh.
 */
let _toyUnderPointer = false

export function setToyUnderPointer(v: boolean) { _toyUnderPointer = v }
export function isToyUnderPointer() { return _toyUnderPointer }
