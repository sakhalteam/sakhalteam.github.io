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
