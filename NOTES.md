# Notes for Nic

Quick reference for things you can tweak yourself without burning Claude usage.

## Camera overrides per zone

The auto-fit camera ([src/useAutoFitCamera.ts](src/useAutoFitCamera.ts)) automatically picks a good angle based on the model's shape. But if a specific zone needs manual tweaking, you can override it in [src/App.tsx](src/App.tsx) on the route:

```tsx
<ZoneScene
  glbPath="/zones/zone_beach_party.glb"
  title="BEACH PARTY"
  camera={{ elevation: 0.45, azimuth: 0.6, padding: 1.2 }}
  environmentPreset="sunset"
/>
```

**What the values mean:**
- `elevation` — camera height angle in radians. `0` = eye level, `~0.55` = nice 3/4 view, `~0.75` = steep top-down, `PI/2` = directly above. Lower = more frontal (good for towers), higher = more top-down (good for rooms/flat scenes).
- `azimuth` — horizontal rotation around the model in radians. `0` = dead-on front, `0.4` = slight 3/4 angle (default), higher = more rotated. Try values between `0.2` and `0.8`.
- `padding` — how much breathing room around the model. `1.0` = tight fit, `1.3` = comfortable (default), `1.5`+ = lots of space.

**If auto-fit is wrong for a new zone**, usually just tweak `elevation`:
- Tower/tall model looks too top-down? Lower elevation (try `0.3`)
- Flat model looks too flat? Raise elevation (try `0.65`)
- Model feels too far away? Lower padding (try `1.1`)

## Keyboard controls

These are the controls available on all 3D scenes:

| Key | Action |
|-----|--------|
| WASD | Pan (move camera horizontally) |
| Q / E | Orbit left / right |
| R / F | Zoom in / out |
| Z / X | Rise / lower (vertical) |
| Shift | 2x speed modifier |

Defined in [src/useKeyboardControls.ts](src/useKeyboardControls.ts). Speed values (`panSpeed`, `orbitSpeed`, `zoomSpeed`) can be tweaked per-scene if needed.

## Turntable auto-rotation

All scenes slowly rotate counter-clockwise until the user interacts. Defined in [src/useTurntable.ts](src/useTurntable.ts). Default speed is `0.1` rad/s (~6 deg/s). To change per-scene, you'd need to pass `speed` to `useTurntable()` in the CameraRig.

## GLB naming cheat sheet

| Prefix | What happens on click |
|--------|----------------------|
| `zone_<key>` | Loads `public/zones/zone_<key>.glb` as a new scene |
| `portal_<key>` | Navigates to an external site |
| `toy_<key>` | Plays animation, no navigation |
| `zc_<key>_<name>` | Not clickable, glows with parent zone |
| (no prefix) | Scenery, not interactive |

## Adding a new zone

1. Export `.glb` from Blender with objects at scene root (flat, no parenting)
2. Run `npm run optimize` to compress
3. Drop the `.glb` in `public/zones/`
4. Add a route in `src/App.tsx`
5. Add URL mapping in `IslandScene.tsx` → `ZONE_URLS` (if it's on the island)
6. Optionally add a display name in `ZONE_LABELS` (otherwise auto-derived from key)

## Environment presets

Available for the `environmentPreset` prop: `night`, `forest`, `sunset`, `dawn`, `apartment`, `city`, `park`, `lobby`, `studio`, `warehouse`
