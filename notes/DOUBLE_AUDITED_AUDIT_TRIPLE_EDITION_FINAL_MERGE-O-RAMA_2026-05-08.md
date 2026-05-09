# Double-Audited Audit Triple Edition Final Merge-O-Rama - sakhalteam.github.io - 2026-05-08

Final source-of-truth cleanup checklist merged from:

- `AUDIT_2026-05-08.md`
- `CODEX_AUDIT_2026-05-08.md`
- `claude_merged_audit_2026-05-08.md`
- `codex_merged_audit_2026-05-08.md`

This is the one to keep if the others get pruned.

## TL;DR

**Overall health: good.** The site is in solid shape: strict TypeScript, coherent React/R3F structure, and `sceneMap.ts` is doing its job as the world index. The spruce-up work is mostly about fixing a few real broken refs, reducing asset/debug/doc drift, and tightening small UX/code-quality edges.

Do these first:

1. Fix the two missing sound refs.
2. Decide whether the `TEMP DEBUG` material pass is intentional.
3. Replace the default Vite README.
4. Investigate the three largest zone GLBs.
5. Consolidate duplicated mesh helpers.
6. Add visible keyboard focus styles.
7. Clean stale docs and orphan/template assets.

## Verified Corrections

- **The GLB optimizer already batches.** `npm run optimize` runs `scripts/optimize-glb.mjs`, which walks `public/` recursively when called without args.
- **Deploy already optimizes before build.** `.github/workflows/deploy.yaml` runs `npm ci`, `npm run optimize`, then `npm run build`.
- **The large GLB issue is probably not "forgot to run optimize."** Since CI optimizes automatically, oversized files need Blender/export/texture investigation.

## Repo Snapshot

- **Stack:** Vite 8, React 19, TypeScript 6, React Router 7, React Three Fiber, drei, postprocessing, no Tailwind.
- **Build:** `tsc -b && vite build && cp dist/index.html dist/404.html`.
- **Deploy:** GitHub Pages workflow with Node 22, `npm ci`, `npm run optimize`, and `npm run build`.
- **Site shape:** 3D island hub with active zones, coming-soon zones, toy interactables, and external project portals.
- **Main source of truth:** `src/sceneMap.ts` for zones, portals, toys, sites, labels, sounds, camera/focus config, and atmosphere links.

## Priority 0 - Actually Broken Or Risky

- [ ] **Fix missing sound ref: `/sounds/ss_brainfog_horn.mp3`.**
  - Referenced in `src/sceneMap.ts`.
  - File does not exist in `public/sounds/`.
  - Either add the intended file, rename the reference, or remove the sound entry.

- [ ] **Fix missing sound ref: `/sounds/ramen.mp3`.**
  - Referenced in `src/sceneMap.ts`.
  - File does not exist in `public/sounds/`.
  - Same options: add, rename, or remove.

- [ ] **Resolve the `TEMP DEBUG` material pass in `ZoneScene.tsx`.**
  - Current code forces `depthWrite = true` on every material.
  - If intentional, rename the comment and document the z-fighting/sort-flicker reason.
  - If temporary, gate it behind dev/debug state or remove it.

- [ ] **Investigate heavy zone GLBs.**

  | File                      | Current size | Action                                          |
  | ------------------------- | -----------: | ----------------------------------------------- |
  | `zone_bird_sanctuary.glb` |      48.8 MB | inspect textures, mesh density, export settings |
  | `zone_nimbus_land.glb`    |      28.6 MB | inspect textures, mesh density, export settings |
  | `zone_cloud_town.glb`     |      18.7 MB | inspect textures, mesh density, export settings |

  Keep this budget: flag zone GLBs over 10 MB, investigate over 20 MB.

## Priority 1 - Best Quick Wins

- [ ] **Replace `README.md`.**
  - It is still the default Vite template.
  - Include project overview, commands, Node version, deploy behavior, and GLB optimization notes.

- [ ] **Consolidate mesh helpers.**
  - `collectMeshes()` exists in `src/meshUtils.ts`.
  - `ToyInteractor.tsx` has a duplicate `collectMeshes()` and a local `collectMeshesExcludingHitboxes()`.
  - Move the filtered helper to `meshUtils.ts` and import both from there.

- [ ] **Add visible `:focus-visible` styles.**
  - Cover QuickNav, Breadcrumbs, ComingSoonToast close, turntable toggle, and debug controls.
  - Replace any `outline: none` behavior with an obvious, polished focus ring.

- [ ] **Wrap or remove production console logs.**
  - `src/IslandScene.tsx`
  - `src/FlightPath.tsx`
  - (Note: `useLightingControls.ts` console calls at lines 192–193 are an intentional clipboard fallback — leave them.)
  - Use `if (import.meta.env.DEV)` where logs are useful for authoring.

- [ ] **Fix easy `as any` casts.**
  - `App.tsx`: type `environmentPreset` against the drei environment preset union instead of casting.
  - `ZoneScene.tsx`: avoid material prop casts where Three material types can be narrowed.

- [ ] **Update stale docs.**
  - `CLAUDE.md` says breadcrumb UI is not built. It is.
  - `CLAUDE.md` references `scripts/optimize-glb.sh`; current script is `scripts/optimize-glb.mjs`.
  - `nics_wishlist.md` should get dates on new/deferred items.

- [ ] **Clarify or remove orphan/template assets.**
  - `public/backup_zone_glbs_dont_use/zone_cloud_town.glb`
  - `public/sounds/enter-battle-ff7.mp3`
  - `public/vite.svg`
  - `src/assets/react.svg`

## Priority 2 - Small Config And Data Hygiene

- [ ] **Add explicit `base: '/'` in `vite.config.ts`.**
  - Current default is correct for the org root domain.
  - Make it explicit with a one-line comment so future deploy changes are less confusing.

- [ ] **Consider moving `tsBuildInfoFile` out of `node_modules/.tmp/`.**
  - Current setup works, but `.tmp` is easy to clean accidentally.
  - A steadier path like `node_modules/.tsbuild/` would make incremental cache behavior clearer.

- [ ] **Document `labelOffsetY` in `sceneMap.ts`.**
  - It is useful for label clipping/placement fixes.
  - Add a short comment at the type definition explaining when to use it.

- [ ] **Make quiet toy animation explicit where helpful.**
  - Missing `animation` defaults to `"spin"`.
  - That is nice for prototyping but can hide undecided behavior.
  - Add `animation: "none"` to intentionally quiet toys.

- [ ] **Verify `animation: "toggle"` behavior.**
  - Used by nimbus_land hut doors.
  - Confirm behavior is still correct and document the contract in the relevant type/comment.

- [ ] **Keep portal lists in sync.**
  - Portal/site definitions live in more than one logical spot.
  - When editing portals, verify QuickNav and scene definitions still agree.

## Priority 3 - Medium Spruce-Up Projects

- [ ] **Add a reverse SceneAuditor pass.**
  - Current auditing catches GLB objects with no `sceneMap` entry.
  - Also catch `sceneMap` entries whose matching GLB object disappeared.
  - This is especially useful for coming-soon zones.

- [ ] **Audit coming-soon zones.**
  - Confirm `glbPath: null` / `path: null` entries still match island GLB object names.
  - Prune entries that are no longer represented in Blender.

- [ ] **Make debug tooling more dev/authoring-oriented.**
  - Leva currently mounts globally.
  - `useControls()` can run even when hidden.
  - `r3f-perf` is imported by scene modules.
  - This is fine while building, but should get a production-hardening pass later.

- [ ] **Consolidate CSS variables/resets if drift appears.**
  - `App.css`, `index.css`, and `CloudTransition.css` each carry some global styling responsibility.
  - A future `theme.css` may be worth it if tokens/resets keep spreading.

- [ ] **Migrate legacy lighting to the Atmosphere subsystem.**
  - Good endpoint: fewer hardcoded `zoneKey === "..."` branches in scene rendering.

- [ ] **Z-fighting pass on known trouble spots.**
  - Especially `ss_aqua` and bird sanctuary notes from `nics_wishlist.md`.

## Asset Notes

- Zone GLBs are the main asset risk.
- Cloud sprites are the largest sprite cluster; WebP conversion is a later nice-to-have.
- Audio size is reasonable; missing and unused references matter more than raw audio weight right now.
- Keep a permanent asset budget note somewhere: zone GLB over 10 MB gets flagged, over 20 MB gets investigated.

## Accessibility Notes

- Existing ARIA coverage is generally decent: QuickNav, Breadcrumbs, ComingSoonToast, turntable toggle, and decorative SVGs are pointed in the right direction.
- The main missing piece is visible keyboard focus.
- `--muted: #4a5a6a` is marginal on ocean-colored backgrounds. Use it for secondary/decorative copy only.
- The 3D canvas does not need static-image alt text; surrounding UI should carry the meaning.

## Bigger Ideas, Not Defects

Keep these as future feature/design ideas, not cleanup blockers:

- [ ] **Manual/how-to zone.**
  - A real user guide and a dev memory palace for controls, toy flags, debug toggles, incomplete areas, and naming rules.

- [ ] **Hover-triggered toy behavior.**
  - Start with `hoverSounds` plus debounce.
  - Later split hover animations from click animations.

- [ ] **Co-animation/reaction graph.**
  - Start tag-based once a concrete toy group needs it.

- [ ] **Cloud transition polish.**
  - The current transition works.
  - Layered Paper-Mario-style clouds would be high-impact visual polish.

- [ ] **Seasonal variants.**
  - More plausible once Atmosphere config is declarative and stable.

- [ ] **Possible future `sceneMap.ts` split.**
  - Do not split just because the file is large.
  - If editing pain becomes real, consider `core.ts`, `zones.ts`, `islandToys.ts`, `zoneToys.ts`, and `sites.ts`.

- [ ] **Deferred feature TODOs.**
  - Train departure animation.
  - Shark circle swim.
  - NES UI in reading room.
  - Proto-Typing site scaffold.
  - Cloud town toy sounds.
  - Reading room TV gif and bed snore.

## Recommended First Cleanup Batch

Do this as one low-risk pass:

1. Fix the two missing sound refs.
2. Resolve the `TEMP DEBUG` material pass.
3. Replace the README.
4. Consolidate mesh helpers.
5. Add focus-visible styles.
6. Update stale docs around breadcrumbs and optimizer script naming.
7. Remove or justify orphan/template assets.
8. Wrap production console logs.
9. Fix the easy `as any` casts.

## Monthly Maintenance Checklist

- [ ] Run build and record the result.
- [ ] Grep for `console.`, `as any`, `TEMP`, `TODO`, `@ts-ignore`, and `@ts-expect-error`.
- [ ] Verify every local `/sounds/...` reference exists.
- [ ] List local sound files with no `/sounds/...` references.
- [ ] List the largest 20 files in `public/`.
- [ ] Flag zone GLBs over 10 MB and investigate over 20 MB.
- [ ] Confirm deploy workflow still runs optimize and build.
- [ ] Run the app locally and inspect SceneAuditor warnings for each active zone.
- [ ] Reverse-audit sceneMap entries against current Blender object names.
- [ ] Verify QuickNav/site portal lists match scene definitions.
- [ ] Re-check Breadcrumbs, QuickNav, focus rings, and debug tools.
- [ ] Promote actionable wishlist items into a dated TODO section.

Generated 2026-05-08. Suggested next audit: 2026-06-08.
