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
