# Water settings — how to edit

Quick reference for tuning the `<Water />` component
([src/Water.tsx](../src/Water.tsx)). Everything below is a prop you can pass
when mounting the component.

## Where water is used today

- **IslandScene** ([src/IslandScene.tsx](../src/IslandScene.tsx)) — main hub
  water. Knobs are set explicitly, tune here.
- **ZoneScene** ([src/ZoneScene.tsx](../src/ZoneScene.tsx)) — only inside
  `zone_ss_brainfog`. Uses mostly defaults with `size={320}`.
- Defaults live in `Water.tsx` — editing them affects every future call that
  doesn't override. Prefer overriding per-call when you just want a vibe for
  one scene.

## Props cheat sheet

| Prop | Default | What it does |
|---|---|---|
| `size` | `80` | Plane edge length in world units. Brainfog uses `320` because it's an open-ocean feel. The plane has a circular feathered edge — extra size = more open water visible before fade. |
| `waterLevel` | `-0.03` | Y position of the surface. Slightly below 0 so beaches don't clip through. |
| `color` | `#00fccd` | Base cyan. Pairs with the hardcoded deep color `#0b6fb8`. |
| `opacity` | `0.7` | Surface transparency. Lower = see through to geometry below. |
| `waveSpeed` | `0.55` | Speed of the plane's 3D surface bob (vertex shader). Mostly invisible top-down. |
| `waveAmplitude` | `0.04` | Vertex wave height in world units. Higher = choppier surface. Try `0.08–0.15` for rough seas, `0.02` for glassy. |
| `foamSpeed` | `0.25` | **Main "is the foam drifting fast" knob.** The one that actually fixes "waves flying across the ocean." Lower = calmer tide. |
| `foamScale` | `22` | Foam-island/blob density. **Lower = bigger, sparser blobs.** 5 = huge sparse, 14 = medium, 25+ = dense confetti. |
| `foamDepth` | `0.08` | Foam threshold/coverage. Higher = thicker, more foam; lower = thinner, sparser. Try `0.15` for heavy foam, `0.04` for sparse. |
| `waveScale` | `8` | Wave-line/squiggle density. Same direction as `foamScale`. 3 = few big sweeping lines, 10+ = many tight squiggles. |
| `rimWidth` | `0.6` | Intersection-foam stripe width in world units. Where water meets a mesh (island shore, ship hull, submerged toys), a white foam rim appears. Set to `0` to disable the effect **and skip the depth pre-pass** (perf win — saves a full scene render per frame). |
| `rimColor` | `#ffffff` | Rim foam color. |
| `rimStrength` | `0.95` | Rim foam opacity/blend. |
| `funnelCenter` | — | Optional `React.RefObject<THREE.Vector3>`. If provided, the water plane carves a funnel depression + cuts a transparent hole at that world position. Used for the island's whirlpool. |
| `funnelRadius` | `3.8` | Radius of the funnel falloff in world units. |
| `funnelDepth` | `0.85` | Max depth of the funnel dip. |

## Common tuning recipes

- **Foam "flying across the ocean" too fast:** drop `foamSpeed` to `0.1–0.15`.
- **Boxy/grid-looking waves:** already fixed — the component uses simplex
  noise, not value noise. If they look boxy, check you haven't swapped the
  noise function.
- **Want bigger, sparser foam:** drop `foamScale` to `10–14`.
- **Want calmer water overall:** drop both `foamSpeed` and `waveSpeed`.
- **No rim foam showing up:** check `rimWidth > 0`, and verify the target
  scene actually has opaque or transparent geometry intersecting the water
  plane. The depth pre-pass uses an override material, so transparent meshes
  (glass, alpha'd decals) are still detected.
- **Perf dropped when adding water to a new scene:** the rim-foam effect
  re-renders the full scene once per frame for the depth pass. If a scene
  doesn't need intersection foam, set `rimWidth={0}` to skip it.

## How the intersection foam works

1. Each frame, before the main render, the scene renders into an off-screen
   render target with a `DepthTexture` — with the water mesh hidden and a
   cheap `MeshBasicMaterial` forced as an override (so transparent meshes
   still write depth).
2. In the water fragment shader, we sample the scene's depth at the same
   screen position as the current water pixel.
3. The difference between the water fragment's depth and the scene depth =
   "water column thickness" at that pixel. Small thickness → rim foam.
4. We perturb the stripe with high-frequency simplex noise so the edge looks
   organic.

See the `// ---- Intersection foam (rim) ----` comment block in
[Water.tsx](../src/Water.tsx) for the GLSL.

## Origin

Adapted from the Codrops tutorial _Creating Stylized Water Effects with
React Three Fiber_
(<https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/>).
The intersection-foam approach comes from the linked Three.js sandbox
(archived at `notes/claude_heres_the_sandbox_js_file.js`). We skipped the
tutorial's stripe-on-submerged-mesh approach in favor of the depth-texture
version so submerged meshes don't each need a custom shader.
