# sakhalteam.github.io — 3D island hub landing page

> Parent context: `../CLAUDE.md` has universal preferences and conventions. Keep it updated with anything universal you learn here.

## Memory system
- **At conversation start and after context compaction**, always read `MEMORY.md` and scan relevant memory files before proceeding. This prevents re-asking questions or losing context from prior sessions.
- Keep `~/.claude/projects/` memory files updated (user profile, project state, feedback)
- If you discover something **universal** (interaction prefs, conventions, cross-project patterns), note it so Nic can update `Code/CLAUDE.md`. Don't put project-specific info in other repos' CLAUDE.md files.
- If you discover something **project-specific**, update this file only.
- When upgrading dependencies, always verify CI pipeline (deploy.yaml Node version, tsconfig compatibility) before pushing.

## Org-wide conventions
- **Stack**: Vite 8 + React 19 + TypeScript 6. `"types": ["vite/client"]` required in tsconfig.app.json.
- **Deploy**: GitHub Actions (Node 22) → GitHub Pages.
- **Shared pattern**: HomeBtn component (fixed top-left, links to sakhalteam.github.io). Every sub-site should have one.
- **Themes**: dark-first, modern. headlessui.com aesthetics — gradients, glows, frosted glass.
- **Design philosophy**: Animal Crossing museum model — layered depth, available but never imposed. Playful, approachable, never overwhelming.

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

**The prefix is the verb. The key is the noun.** Prefixes encode *what happens on click*, keys encode *the destination/target*. The scene map (future `sceneMap.ts`) encodes the full topology (hierarchy, parent scenes, back-navigation).

Object name prefixes in GLB files determine behavior:

| Prefix | Behavior (what happens on click) | File location |
|--------|----------------------------------|---------------|
| `zone_<key>` | Loads a new 3D scene | `public/zones/zone_<key>.glb` |
| `portal_<key>` | Navigates to an external sakhalteam minisite | No GLB — it's a URL |
| `toy_<key>` | Plays animation / interaction, no navigation | Part of parent GLB |
| `zc_<key>_<name>` | Not clickable — glows with parent zone on hover | Part of parent GLB |
| `pc_<key>_<name>` | Not clickable — glows with parent portal on hover | Part of parent GLB |
| *(no prefix)* | Scenery, decoration — not interactive | Part of parent GLB |

**Depth is implicit, not encoded in the prefix.** A `zone_` inside island.glb and a `zone_` inside zone_reading_room.glb behave identically — both load a .glb scene. The hierarchy comes from *which scene contains the object*, not the prefix. This means no `room_`/`nook_`/`cranny_` prefixes — just `zone_` for any scene-loading click at any depth.

**Zone names describe destinations, not the clickable object.** The boombox mesh on the island is `zone_beach_party` (the place you arrive at), not `zone_boombox` (the thing you clicked). Exception: if the zone IS the object (e.g., a ship named S.S. Brainfog), naming after the object is fine.

**`zc_` convention (zone children):** Objects prefixed `zc_<key>_` are siblings (NOT children) of `zone_<key>` in Blender. They receive the bloom glow when the zone is hovered but don't create hitboxes or labels. This decouples glow membership from Blender parenting, allowing free animation. Matching uses longest-key-first to avoid ambiguity. No `empty_zone_x` wrappers needed — everything should be flat at the scene root.

**Hierarchy:** Hub (island.glb) → Zone → Sub-zone → ... → Portal (or dead end)

Not every path ends in a portal. Dead-end zones are valid (puzzles, easter eggs, vibes). Toys (`toy_`) are interactive but don't navigate — they're fun diversions within a scene.

**Naming in island.glb:** Objects named `zone_x` that don't yet have a corresponding `zone_x.glb` in `public/zones/` are coming-soon zones. Keeping the `zone_` prefix signals Nic's intent to eventually build a zone scene for them.

**Display labels:** `ZONE_LABELS` in IslandScene.tsx maps object keys to custom display names. If unlisted, labels are auto-derived via toTitleCase.

**Zone URL routes:** Internal zone scenes use `/zone-x` URL prefix (e.g., `/zone-bird-sanctuary`) to avoid collisions with external sites at `/x`.

**Minigames:** Small interactive experiences (e.g., a computer screen minigame inside a zone) stay as components within this repo. Only spin out to a separate repo if it's big enough for Jojo to bookmark independently.

## Folder structure
```
public/
├── island.glb                          # Hub scene
└── zones/
    ├── zone_bird_sanctuary.glb         # Zone scenes (any depth — sub-zones go here too)
    └── zone_*.glb
```
Keep it flat. All zone GLBs live in `public/zones/` regardless of depth in the navigation tree. The scene map encodes parent-child relationships, not the folder structure.

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
- `zone_bird_sanctuary` → `/zone-bird-sanctuary` → `portal_bird_bingo` → `/bird-bingo/`
- `zone_ss_brainfog` → `/zone-ss-brainfog` → `portal_adhdo` → `/adhdo/`
- `zone_cloud_town` → `/zone-cloud-town` → `portal_weather_report` → `/weather-report/`
- `zone_tower_of_knowledge` → `/zone-tower-of-knowledge` → `zone_reading_room` → `/zone-reading-room` → `portal_japanese_articles` → `/japanese-articles/`
- `zone_pokemon_island` → `/zone-pokemon-island` → `portal_pokemon_park` → `/pokemon-park/`
- `zone_family_mart` → `/zone-family-mart` → `zone_family_mart_interior` → `/zone-family-mart-interior` (dead-end for now)
- `zone_beach_party` → `/zone-beach-party` → `portal_nikbeat` → `/nikbeat/`

## Coming-soon zones (meshes exist in island.glb, not yet wired to sites)
zone_crystals, zone_flower_shop, zone_mystery_zone, zone_nessie, zone_the_tunnels

## Blender naming (no parenting needed)
All objects should be flat at the scene root — no `empty_zone_x` wrappers, no parenting hierarchy. Use `zc_<key>_<name>` prefix to include meshes in a zone's hover glow. Cranes use `zc_` prefix on their respective zones (e.g., `zc_crystals_crane.004`).

## GLB optimization
Optimized via gltf-transform: Draco geometry compression + WebP texture compression + 2048px texture cap.
- island.glb: 33 MB → 6.5 MB
- zone_bird_sanctuary.glb: 52 MB → 8.8 MB
- Run `npm run optimize` after adding/updating GLBs. Hierarchy-safe (no flatten/join/simplify).

## SPA routing
`404.html` is copied from `index.html` during build (`npm run build`). This fixes GitHub Pages 404 on refresh for internal routes like `/zone-bird-sanctuary`.

## Planned: scene map (`sceneMap.ts`)
A single source-of-truth file mapping the entire navigation tree: which scenes contain which zones/portals/toys, parent references for back-navigation, and destination URLs. This replaces the current scattered `ZONE_URLS`/`PORTAL_URLS` constants. Not yet implemented — build this when wiring up back-button navigation or adding sub-zones.

## Example user flows (for context)
- island → `zone_reading_room` → interior scene → `portal_japanese_articles` → /japanese-articles/
- island → `zone_reading_room` → interior scene → `zone_computer_desk` → minigame vignette (component, not separate site)
- island → `zone_bird_sanctuary` → `toy_kiwi` (dance animation) → `zone_deku_sprout` → zoomed-in scene → back → `portal_bird_bingo` → /bird-bingo/
- island → `zone_pokemon_park` → `toy_omanyte` (dance) → `portal_pokemon_park` → /pokemon-park/
- island → `zone_beach_party` → `toy_maracas` (shake) → `portal_nikbeat` → /nikbeat/

## Important
Nic does the Blender modeling himself. Claude helps with the React/Three.js wiring, not the 3D asset creation. When Nic adds a `zone_x` object to a GLB, check that `zone_x.glb` exists in `public/zones/` — flag if missing.
