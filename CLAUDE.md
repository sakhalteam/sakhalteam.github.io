# sakhalteam.github.io — 3D island hub landing page

> Parent context: `../CLAUDE.md` has universal preferences and conventions. Keep it updated with anything universal you learn here.

## What this is
The main portfolio/hub site for sakhalteam. Features an interactive 3D island map built with React Three Fiber. Clickable island zones link to each project (bird sanctuary, reading room, nikbeat, etc). This is the front door to everything.

## Stack
- Vite + React 19 + TypeScript + Tailwind v3
- React Router 7 for internal routes
- Three.js + @react-three/fiber + @react-three/drei for 3D
- `base: '/'` (root domain)
- Deployed to sakhalteam.github.io

## Architecture
- **IslandScene.tsx**: main 3D scene with OrbitControls, GLB island model, clickable zone hotspots
- **BirdSanctuaryScene.tsx**: placeholder for future birds 3D sub-scene
- Zone configuration maps zone mesh names to external URLs (e.g., `zone_bird_sanctuary` → `/bird-bingo/`)
- Custom shaders: fresnel aura vertex/fragment shaders for zone hover glow effects
- Island model lives in `island.blend` (Blender source) — Nic edits this on his main PC

## Pending zones
- `zone_pokemon_park` → `/pokemon-park/` (code wired, needs mesh in island.blend — Pattern B direct link)
- `zone_adhdo` → `/adhdo/` (code wired, needs mesh in island.blend — Pattern B direct link)

## Important
Nic does the Blender modeling himself. Claude helps with the React/Three.js wiring, not the 3D asset creation.
