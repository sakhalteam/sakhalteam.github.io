### ⚠️⚠️⚠️ DO NOT USE `THREE.OutlinePass` IN THIS REPO ⚠️⚠️⚠️

If a future Claude (or you) ever feels tempted to "upgrade" the outline
system to support cross-fade animations, edge thickness control, or glow,
**they will reach for `THREE.OutlinePass` from `three/examples/jsm/postprocessing/OutlinePass.js`. DO NOT.**

That pass does multi-stage scene re-renders (depth + mask + edge detect + glow blur + composite) **every single frame, even with zero objects selected**, and silently desaturates and dims the entire scene. White → grey, warm tones → muted. There is no leva slider, tone-mapping setting, env preset, or material conversion that can compensate for it.

This trap was first walked into on **commit `fb0561a` (2026-04-26)** and not diagnosed for two weeks because the per-frame brightness loss is invisible — you only notice it when you compare against an old screenshot and realize the water foam went grey and the island lighting feels "off" in a way no individual setting can fix.

**Always use drei's `<Outline>` from `@react-three/postprocessing`.** It's a single-fragment-shader effect that composes cleanly. We lose: edge thickness, edge glow, hover cross-fade animation. Worth it.

The whole sad saga, the diagnosis, and the rule are saved in memory: `feedback_outlinepass_dimming_trap.md`.

---

### camera zoom speed and distance stuff

Yep. The zoom stuff is mainly in three places:

1. **Scroll-wheel zoom speed**
   Add/change `zoomSpeed` on the `<OrbitControls />` components.

   Island:
   [IslandScene.tsx](/c:/Users/sakha/Code/sakhalteam.github.io/src/IslandScene.tsx:533)

   ```tsx
   <OrbitControls
     ...
     zoomSpeed={2}
   />
   ```

   Zones:
   [ZoneScene.tsx](/c:/Users/sakha/Code/sakhalteam.github.io/src/ZoneScene.tsx:769)

   ```tsx
   <OrbitControls
     ...
     zoomSpeed={2}
   />
   ```

   Drei/three’s name for “scroll goes farther per wheel notch” is basically `zoomSpeed`. Higher = more aggressive dolly per scroll.

2. **Island zoom-in limit**
   This is hardcoded here:
   [IslandScene.tsx](/c:/Users/sakha/Code/sakhalteam.github.io/src/IslandScene.tsx:541)

   ```tsx
   minDistance={6}
   maxDistance={50}
   ```

   To zoom much closer, lower `minDistance`, maybe `1.5` or `2`.

3. **Zone zoom-in limit**
   Zones get their limits from:
   [useAutoFitCamera.ts](/c:/Users/sakha/Code/sakhalteam.github.io/src/useAutoFitCamera.ts:35)

   ```ts
   minZoomMultiplier = 0.3;
   maxZoomMultiplier = 7;
   ```

   Then:
   [useAutoFitCamera.ts](/c:/Users/sakha/Code/sakhalteam.github.io/src/useAutoFitCamera.ts:117)

   ```ts
   const minDistance = Math.max(radius * minZoomMultiplier, 0.75);
   ```

   So for “universally zoom in much further in zones,” lower both the multiplier and maybe the floor:

   ```ts
   minZoomMultiplier = 0.08
   ...
   const minDistance = Math.max(radius * minZoomMultiplier, 0.25);
   ```

Tiny extra note: click-to-focus closeness is separate. That lives in [useFocusOrbit.ts](/c:/Users/sakha/Code/sakhalteam.github.io/src/useFocusOrbit.ts:42) with `minDistance = 4` and `distanceMultiplier = 4`. That affects how close the camera moves when you click an object, not the raw scroll limit.

For the hitbox checkbox: no, you did not make the site hugely more expensive. When hitboxes are off, it is basically just a subscribed boolean. When hitboxes are on, React renders extra wireframe debug meshes around clickable areas, so there are more draw calls and some extra geometry, but only in debug mode. The checkbox itself is tiny; the cost is “visible debug overlay,” not permanent site weight.

### barrel roll part of debug hitboxes? y/n switch

There’s now one top-level switch in FlightPath.tsx (line 38):

const SHOW_BARREL_ROLL_TRIGGERS_WITH_DEBUG_HITBOXES = true;
Set that to false and the Hitboxes checkbox will still show normal hitboxes, but not the barrel-roll trigger spheres.

### Tri-Lighting

What this gives you
triLight is now a sceneMap field on zones, portals, and toys. Three forms:

// Use defaults — chill warm 3-point rig
toy("ct_toy_keyboard", "Keyboard", "cloud_town", { triLight: true })

// Override one or more values
toy("ct_toy_metal_gear_rex", "MGR", "cloud_town", {
triLight: { intensity: 0.7, warmth: 0.5 } // brighter, warmer
})

// No rig (default) — just leave it off
toy("ct_toy_ladder", "ladder", "cloud_town", { animation: "none" })
Per-object knobs:

intensity (default 0.6) — master volume
distance (default 2.5) — how far lights sit from the object, in bbox-radii. Higher = softer wraparound
warmth (default 0.3) — 0 = neutral white, 1 = full amber
Global defaults live as DEFAULTS at the top of TriLighting.tsx:23-41 — change those numbers once and every triLight rig retunes simultaneously. That's the "tune the defaults" knob you asked for.

What was undone
The Blender lights are now disabled on import (intensity → 0). They stay in the scene graph but contribute zero light. No re-export needed; whiteout fixed on next refresh. Console logs what came in for sanity.
The BlenderLightHelpers wireframe-renderer is gone — it's what was making the second screenshot look like a planetarium. Replaced with BlenderLightDisabler (no helpers, just disables).
How the rig is shaped
For each triLight object, three PointLights parented to the object:

Light Position (relative to bbox center) Color Weight
Key front-right, ~0.9× bbox-radius up warm-tinted (per warmth) 1.0×
Fill front-left, ~0.4× up neutral white 0.5×
Back behind, ~0.7× up (rim) very subtle cool #dde4ff 0.4×
Each light has a range cap (default distance × 3) so beyond a few units it contributes nothing — keeps each rig local and avoids one toy's lights washing out a neighbor.

To opt zones/toys in
Easiest way to start: pick a couple of zones/toys you want lit and add triLight: true. Reload, see how they look. If the defaults need tuning, change DEFAULTS in TriLighting.tsx. Want one entry brighter/warmer? Override that entry.

Console will log on load: [TriLighting] mounted N rig(s) (M lights) — so you know how many are active.

If you want me to opt-in some defaults across the toys/zones (e.g., add triLight: true to all the cloud_town entries to start), just say the word and I'll batch-add them.
