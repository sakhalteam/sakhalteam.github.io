### ⚠️⚠️⚠️ DO NOT USE `THREE.OutlinePass` IN THIS REPO ⚠️⚠️⚠️

If a future Claude (or you) ever feels tempted to "upgrade" the outline
system to support cross-fade animations, edge thickness control, or glow,
**they will reach for `THREE.OutlinePass` from `three/examples/jsm/postprocessing/OutlinePass.js`. DO NOT.**

That pass does multi-stage scene re-renders (depth + mask + edge detect + glow blur + composite) **every single frame, even with zero objects selected**, and silently desaturates and dims the entire scene. White → grey, warm tones → muted. There is no leva slider, tone-mapping setting, env preset, or material conversion that can compensate for it.

This trap was first walked into on **commit `fb0561a` (2026-04-26)** and not diagnosed for two weeks because the per-frame brightness loss is invisible — you only notice it when you compare against an old screenshot and realize the water foam went grey and the island lighting feels "off" in a way no individual setting can fix.

**Always use drei's `<Outline>` from `@react-three/postprocessing`.** It's a single-fragment-shader effect that composes cleanly. We lose: edge thickness, edge glow, hover cross-fade animation. Worth it.

The whole sad saga, the diagnosis, and the rule are saved in memory: `feedback_outlinepass_dimming_trap.md`.

---

### toys that activate on the first click

Toy click behavior is wired through:

- `src/sceneMap.ts` - where each toy gets `sounds`, `animation`, `focusDistance`, and `focusBehavior`
- `src/ToyInteractor.tsx` - raycasts toys, focuses the camera on pointerdown, then triggers sound/animation on click
- `src/useFocusOrbit.ts` - owns the focus tween and the special `"instant"` behavior

To make a toy do its sound/animation immediately without doing the focus tween first, add:

```ts
focusBehavior: "instant",
```

Example:

```ts
toy("ct_toy_fox_arwing", "Fox's Arwing", "cloud_town", {
  sounds: ["/sounds/fox_snes.wav"],
  animation: "none",
  focusBehavior: "instant",
})
```

This is useful for moving targets, tiny fiddly targets, or toys where the click should feel like a button press instead of a "focus, then activate" interaction.

Normal toys use the default `focusBehavior: "fit"`, which means clicking them starts a camera focus. The activation still happens on that same click in `ToyInteractor`, but the code remembers the pointerdown toy so the camera tween does not make the click-phase raycast miss nearby toys.

---

### toy hitboxes and BVH raycasting

Toy picking lives in `src/ToyInteractor.tsx`.

Default behavior:

- If Blender exports `<toy_name>_hitbox`, ToyInteractor uses that invisible helper mesh for clicks.
- If there is no `_hitbox`, ToyInteractor raycasts against the toy's own visible meshes.

For finicky animated/skinned toys, opt into BVH picking in `src/sceneMap.ts`:

```ts
toy("ssb_toy_shark", "Shark", "ss_brainfog", {
  raycast: "bvh",
})
```

`raycast: "bvh"` tells ToyInteractor to snapshot the toy's current deformed geometry with `three-mesh-bvh`'s `StaticGeometryGenerator`, refit the BVH, and click-test the actual current geometry. This intentionally overrides a Blender `_hitbox` for that toy.

Use it sparingly. Normal buildings/props should keep default raycasting or Blender `_hitbox` helpers.

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
