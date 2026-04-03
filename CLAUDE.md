# sakhalteam.github.io — 3D island hub landing page

> Parent context: `../CLAUDE.md` has universal preferences and conventions. Keep it updated with anything universal you learn here.

## What this is
The main portfolio/hub site for sakhalteam. Features an interactive 3D island map built with React Three Fiber. Clickable zones and portals link to each project. Long-term vision is **Cosmic Osmo / Myst** — click a zone, enter a 3D environment, interact with objects, discover portals to actual sites. The journey is the point. Some zones may be dead ends, puzzles, or easter eggs with no portal at all.

## Stack
- Vite 8 + React 19 + TypeScript 6 (does NOT use Tailwind — custom CSS only)
- React Router 7 for internal routes
- Three.js + @react-three/fiber + @react-three/drei + @react-three/postprocessing for 3D
- `base: '/'` (root domain)
- Deployed to sakhalteam.github.io
- GLB optimization: `npm run optimize` runs gltf-transform (Draco + WebP + texture resize 2048px)

## Navigation terminology (the naming contract)

Object name prefixes in GLB files determine behavior:

| Prefix | Behavior | File location |
|--------|----------|---------------|
| `zone_<key>` | Clickable zone (hitbox + label + glow source) | `public/zones/zone_<key>.glb` |
| `zc_<key>_<name>` | Glows with zone_<key> on hover, not a trigger | Part of parent GLB |
| `room_<key>` | Loads intermediate 3D scene (nested in zone) | `public/zones/rooms/room_<key>.glb` |
| `portal_<key>` | Navigates directly to a sakhalteam site | No GLB — it's a URL |
| *(no prefix)* | Scenery, decoration, or local interaction | Part of parent GLB |

**`zc_` convention (zone children):** Objects prefixed `zc_<key>_` are siblings (NOT children) of `zone_<key>` in Blender. They receive the bloom glow when the zone is hovered but don't create hitboxes or labels. This decouples glow membership from Blender parenting, allowing free animation. Matching uses longest-key-first to avoid ambiguity. No `empty_zone_x` wrappers needed — everything should be flat at the scene root.

**Hierarchy:** Hub (island) → Zone → Room → Subroom → ... → Portal

- **Hub** = the island itself (`island.glb`)
- **Zone** = one level down from island, its own 3D scene
- **Room** = one level down from zone, its own 3D scene
- **Portal** = navigates to a deployed sakhalteam site (the final exit)

Not every path ends in a portal. Dead-end zones/rooms are valid (puzzles, easter eggs, vibes).

**Naming in island.glb:** Objects named `zone_x` that don't yet have a corresponding `zone_x.glb` in `public/zones/` are coming-soon zones. Keeping the `zone_` prefix signals Nic's intent to eventually build a zone scene for them.

**Display labels:** `ZONE_LABELS` in IslandScene.tsx maps object keys to custom display names. If unlisted, labels are auto-derived via toTitleCase.

**Zone URL routes:** Internal zone scenes use `/zone-x` URL prefix (e.g., `/zone-bird-sanctuary`) to avoid collisions with external sites at `/x`.

## Folder structure
```
public/
├── island.glb                          # Hub scene
└── zones/
    ├── zone_bird_sanctuary.glb         # Zone scenes
    ├── zone_*.glb
    └── rooms/
        └── room_*.glb                  # Room scenes (nested in zones)
```
Keep it flat. The GLB hierarchy encodes parent-child relationships. Don't nest folders per-zone.

## Architecture
- **IslandScene.tsx**: Main 3D scene. Traverses island.glb for `zone_`/`portal_` prefixed objects. `ZONE_URLS` maps keys to URLs, `ZONE_LABELS` maps keys to display names. Bloom post-processing on active zone hover, outline pass on coming-soon zone hover.
- **BirdSanctuaryScene.tsx**: Zone scene for bird sanctuary. `HOTSPOTS` map for clickable objects including `portal_bird_bingo`. Route: `/zone-bird-sanctuary`.
- **useOptimizedGLTF.ts**: GLB loader with Draco + Meshopt decompression support.
- **QuickNav.tsx**: Hamburger dropdown (top-left) with direct links to all active sites. Must be updated when adding new sites.
- **App.css**: All styling (no Tailwind). Frosted glass modals, zone cards, quick-nav dropdown.
- **scripts/optimize-glb.sh**: GLB optimization script (Draco + WebP + texture resize). Run via `npm run optimize`.

## Hover effects
Both zone types use bloom (emissive ramp + Bloom pass). The Outline approach was abandoned due to @react-three/postprocessing reactivity issues.
- **Active zones**: Warm salmon-orange bloom glow (`THREE.Color(0.9, 0.35, 0.2)`)
- **Coming-soon zones**: Lavender bloom glow (`THREE.Color(0.55, 0.35, 0.85)`)

## Active zones
- `zone_bird_sanctuary` → zone scene at `/zone-bird-sanctuary` → `portal_bird_bingo` → `/bird-bingo/`
- `zone_ss_brainfog` → `/adhdo/` (boat mesh, has zone GLB)
- `zone_boombox` → `/nikbeat/` (boombox on beach)
- `zone_reading_room` → `/japanese-articles/` (Bell Tower, has zone GLB)
- `zone_pokemon_park` → `/pokemon-park/` (rocky island + pokemon children)
- `zone_weather_report` → `/weather-report/` (cloud mesh, has zone GLB)

## Coming-soon zones (meshes exist in island.glb, not yet wired to sites)
zone_crystals, zone_family_mart, zone_flower_shop, zone_nessie, zone_pokemon_center, zone_underground

## Blender naming (no parenting needed)
All objects should be flat at the scene root — no `empty_zone_x` wrappers, no parenting hierarchy. Use `zc_<key>_<name>` prefix to include meshes in a zone's hover glow. Cranes use `zc_` prefix on their respective zones (e.g., `zc_crystals_crane.004`).

## GLB optimization
Optimized via gltf-transform: Draco geometry compression + WebP texture compression + 2048px texture cap.
- island.glb: 33 MB → 6.5 MB
- zone_bird_sanctuary.glb: 52 MB → 8.8 MB
- Run `npm run optimize` after adding/updating GLBs. Hierarchy-safe (no flatten/join/simplify).

## SPA routing
`404.html` is copied from `index.html` during build (`npm run build`). This fixes GitHub Pages 404 on refresh for internal routes like `/zone-bird-sanctuary`.

## Important
Nic does the Blender modeling himself. Claude helps with the React/Three.js wiring, not the 3D asset creation. When Nic adds a `room_x` object to a zone GLB, check that `room_x.glb` exists in `public/zones/rooms/` — flag if missing.
