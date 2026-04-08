# Planned Features

## Completed

### ~~1. Unified glow system~~ ✓
BloomDriver.tsx extracted as shared module. Emissive lerp at 35% max tint + 0.08 intensity boost. Used by IslandScene, ZoneScene, BirdSanctuaryScene.

### ~~5. Toy hover effect~~ ✓
Proximity-based "magic wand" labels on ToyInteractor. Labels hidden by default, revealed within 120px cursor radius with 1.5s linger. Blue pill style distinct from orange/purple zone glow.

### ~~6. sceneMap.ts~~ ✓
Single source of truth implemented. All scattered constants replaced. Exports getZoneConfig, getPortalConfig, getHotspotConfig, getToyConfig, getActiveZones, getSisterSites, getBreadcrumbs. App.tsx routes auto-generated.

### ~~7. Turntable play/pause~~ ✓
0.04 rad/s rotation. 15s idle auto-resume. Manual toggle button in footer. Returns { stop, toggle, playing }.

### ~~8. Pokemon toy interactions~~ ✓
ToyInteractor with pixel-perfect mesh raycasting, Z-axis spin on click (0.6s ease-out), Pokemon cry audio (ogg from PokeAPI, ~50KB total), proximity label reveal.

### ~~9. Crane glow bug~~ deferred
GPU-instanced meshes with unnamed nodes. Nic will redo cranes in Blender as separate objects.

### ~~10. Bird sanctuary permanent bloom~~ ✓
No longer reproducing.

## Remaining (priority order)

### 2. Breadcrumb navigation

Add granular back-navigation for deep zones. Example: `Island > Tower of Knowledge > Reading Room`. Keep the existing "Back to Island" button (sometimes you want the elevator), but add breadcrumbs so users can go up one level at a time. `getBreadcrumbs()` in sceneMap.ts is already implemented — just needs UI.

### 3. Site map / quick-jump menu

Hidden but accessible menu showing the full zone hierarchy. Useful for dev/testing (jump to any zone instantly) and for users like Jojo who know the name of where they want to go. Should include sister sites (bird-bingo, nikbeat, etc.) alongside zone hierarchy. Could reuse/extend QuickNav.tsx. sceneMap.ts has all the data needed.

### 4. Standardize HomeBtn across sister sites

Grab the HomeBtn from bird-bingo (best current version) and apply it to all other org sites (nikbeat, japanese-articles, pokemon-park, weather-report, adhdo). Each sub-site should have a consistent fixed-position home button linking back to sakhalteam.github.io.
