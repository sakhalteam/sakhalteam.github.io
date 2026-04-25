// debugFlags.ts
//
// Query-string driven debug toggles. Read once at module load; flip by
// editing the URL (e.g. ?debug=hitboxes) and refreshing. Lightweight on
// purpose — no state, no subscriptions, no persistence.

const params =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

const debugSet = new Set(
  (params.get("debug") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** True when `?debug=hitboxes` is in the URL. Renders all invisible
 *  click hitboxes (zone markers, hotspots, flight followers, and the
 *  per-toy proxy boxes) as translucent wireframes. */
export const DEBUG_HITBOXES = debugSet.has("hitboxes");
