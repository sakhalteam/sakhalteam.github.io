# Planned Features

## Priority order (suggested)

### 1. Unified glow system for all zone scenes + fix bird sanctuary glow
Port the orange/purple bloom glow from IslandScene to ZoneScene and BirdSanctuaryScene. Every `portal_` object should glow orange on hover. Every `zone_` object without a corresponding `.glb` in `public/zones/` should glow purple (coming-soon). The deku tree (`portal_bird_bingo`) in bird sanctuary still has the old fresnel aura shader — replace with the new bloom system.

### 2. Breadcrumb navigation
Add granular back-navigation for deep zones. Example: `Island > Tower of Knowledge > Reading Room`. Keep the existing "Back to Island" button (sometimes you want the elevator), but add breadcrumbs so users can go up one level at a time. This likely depends on building the `sceneMap.ts` (single source of truth for zone hierarchy).

### 3. Site map / quick-jump menu
Hidden but accessible menu showing the full zone hierarchy. Useful for dev/testing (jump to any zone instantly) and for users like Jojo who know the name of where they want to go. Should include sister sites (bird-bingo, nikbeat, etc.) alongside zone hierarchy. Could reuse/extend QuickNav.tsx.

### 4. Standardize HomeBtn across sister sites
Grab the HomeBtn from bird-bingo (best current version) and apply it to all other org sites (nikbeat, japanese-articles, pokemon-park, weather-report, adhdo). Each sub-site should have a consistent fixed-position home button linking back to sakhalteam.github.io.

### 5. New hover effect for "toy" objects
Birds in bird sanctuary, and future toy_ objects, need a hover effect that says "I'm interactable but I don't navigate anywhere." NOT the same orange/purple glow as zones/portals. Ideas: subtle spotlight/rim light, gentle bounce, outline shimmer, or a soft white/blue highlight. Should be noticeable but not overwhelming. Prototype a few options.

### 6. sceneMap.ts — single source of truth
Build the planned `sceneMap.ts` that encodes the full navigation tree: which scenes contain which zones/portals/toys, parent references for back-navigation, destination URLs. Replaces scattered `ZONE_URLS`/`PORTAL_URLS` constants. Required before breadcrumbs can work properly.
