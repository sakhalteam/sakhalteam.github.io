# sakhalteam.github.io — 3D island hub landing page

> Parent context: `../CLAUDE.md` has universal preferences and conventions. Keep it updated with anything universal you learn here.

## What this is
The main portfolio/hub site for sakhalteam. Features an interactive 3D island map built with React Three Fiber. Clickable island zones link to each project. Long-term vision is **Cosmic Osmo** — click a zone, enter a 3D environment, interact with objects, one object takes you to the actual site. This is the front door to everything.

## Stack
- Vite 8 + React 19 + TypeScript 6 (does NOT use Tailwind — custom CSS only)
- React Router 7 for internal routes
- Three.js + @react-three/fiber + @react-three/drei for 3D
- `base: '/'` (root domain)
- Deployed to sakhalteam.github.io

## Architecture
- **IslandScene.tsx**: main 3D scene with OrbitControls, GLB island model, clickable zone hotspots. `ZONE_URLS` maps zone mesh names to URLs.
- **BirdSanctuaryScene.tsx**: Pattern A intermediate zone — 3D scene with deku tree, cassowary, birds, and GLB animations. Clicking the deku tree goes to bird-bingo.
- **QuickNav.tsx**: hamburger dropdown (top-left) with direct links to all active sites, bypassing zones. Must be updated when adding new sites.
- **App.css**: all styling (no Tailwind). Frosted glass modals, zone cards, quick-nav dropdown.
- Custom shaders: fresnel aura vertex/fragment shaders for zone hover glow effects
- Island model lives in `island.blend` (Blender source) — Nic edits this on his main PC

## Zone patterns
- **Pattern A (Cosmic Osmo)**: island → intermediate 3D scene → link to site. Currently only bird_sanctuary uses this.
- **Pattern B (Direct)**: island → site directly. Default for most zones.

## Active zones
- `zone_bird_sanctuary` → Pattern A → `/bird-sanctuary` scene → `/bird-bingo/`
- `zone_adhdo` → Pattern B → `/adhdo/` (S.S. Aqua boat mesh)
- `zone_boombox` → Pattern B → `/nikbeat/` (boombox on beach)
- `zone_reading_room` → Pattern B → `/japanese-articles/` (Bell Tower)
- `zone_pokemon_park` → Pattern B → `/pokemon-park/` (torii gate + pokemon)
- `zone_weather_report` → Pattern B → `/weather-report/` (cloud mesh)

## Coming-soon zones (meshes exist, not wired)
zone_crystals, zone_family_mart, zone_flower_shop, zone_nessie, zone_pokemon_center, zone_underground

## island.glb notes
- 32.4 MB, 65 nodes, 47 meshes, 108 textures
- 92% of file size is textures (island base texture alone is 20.6 MB)
- Optimization opportunity: resize/compress textures, not polycount

## Important
Nic does the Blender modeling himself. Claude helps with the React/Three.js wiring, not the 3D asset creation.
