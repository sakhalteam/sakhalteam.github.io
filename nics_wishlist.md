<!-- A place for Nic to jot down ideas when he's not sure where to tell claude to put them or gets confused and wants to just quickly get it out of his brain. -->

## Architecture cleanup backlog (2026-04-21 audit)

### Medium-effort: migrate all zones to the Atmosphere system

End state: drop the drei `Environment preset` path entirely. Every zone declares what subsystems it wants à la carte — e.g. cloud_town gets `["sky", "clouds", "stars", "wind"]`, bird_sanctuary gets `["sky", "sun", "dappled_canopy", "pollen"]`, etc. Means:

- Recreate `BirdSanctuaryLighting`'s dappled-canopy effect as a proper Atmosphere subsystem (new file in `src/environment/subsystems/`), register in `REGISTRY`.
- Blocked on: nailing the atmosphere system in cloud_town first (Nic has outstanding issues to raise there).
- Once migrated, delete the legacy ambient+directional lighting branch in `ZoneScene.tsx` (the `!useAtmosphere` fallback) and the hardcoded `zoneKey === "bird_sanctuary"` checks.

### Deferred from audit

- **hour/minute split** — keep as-is for authoring ergonomics (Nic's call).
- **Bird sanctuary special lighting** — intentional (dappled tree-canopy feel). Will fold into atmosphere migration above rather than ripping out now.
- **`sounds:` overloaded on zones** — not actually a problem. Revisit only when/if ambient audio is introduced (then add a separate `ambientSound` field).

### Architectural rule learned 2026-04-21: IBL and Atmosphere are separate jobs

- `Environment preset` (drei HDRI) = IBL (always-on photon fill so objects are visible). Always keep it, `background={false}` so HDRI isn't seen.
- `Atmosphere` subsystems = mood/weather/sky/sun direction/fog. Stacked _on top_ of IBL.
- Never remove IBL from a zone. Without it, night = pitch black and clear days look grey because nothing reflects sky into shadows.
- When migrating legacy zones to atmosphere, don't drop their `env` preset. The atmosphere replaces only the hardcoded directional+ambient lights, not the HDRI.

### Cloud_town atmosphere tuning todo

- Nighttime floor feels too dark once sun dips below horizon. Consider: bump ambient `ambientIntensity` minimum in `TIME_ANCHORS` (hour 0 / 24 / 4.5), or add a constant tiny fill light that's always on.
- "Clear" day still looks muted. Likely ACES tone mapping + muted sunColors. Try dropping `toneMappingExposure` from 1.3 → 1.0, and/or punching up the clear-noon sunColor/skyHorizon anchors.
- Ground looks grey regardless of weather. Probably material issue on the cloud_town ground mesh, not an atmosphere bug.

### Wireframes look cool

I added a temporary wireframe sphere to visualize the barrel roll trigger hitbox/target, and it made me realize that wireframe primitives look really cool. i should add some to starlight zone when I build it eventually. look cool at nighttime especially.

### Fix nikkus pro water anglers classic

its pretty barebones

### add a barenstain's bear treehouse zone (more to come)

jojo adores barenstein bears. make their treehouse in blender, make it part of a zone, even if it's not reachable from island but is rather a nested zone, like maybe she can link to it from bird sanctuary? think on this later.

### note for claude/codex: never delete this file. you can tell what things nic has written versus what you have written. never ever delete something nic has written here. it's his source of ideas/inspiration/random thoughts.

### add lightning to cloud town and fix the clouds in general

'stormy' is a pretty lame excuse for storminess. fix up the everything.

### possible to add multiple 'rolltrigger' sphere hitboxes?

the same way we can have multiple start/finish points, why not have multiple barrel roll triggers scattered throughout the sky? but I don't know how to implement it...

### new zone idea: Bug Sanctuary

ideas: find animated bugs on sketchfab, give them an environment to crawl around in, add option to give them food, like a preset list of food, like for ants, they love the strawberries. for etc, they love the etc.

### ADHDO bugs/features list

when you hover the help ? icon in the lower left, it pops up the help menu, but when you leave the ? icon, it disappears. however, if you CLICK the ? icon, the help menu persists until user clicks away from it. this is confusing because you might hover the ? icon, then say "oh I want to 'gather free globs' from the recovery section. let me just move my mouse and select that....oh.....the menu disappeared....how the hell do I get that thing to stay open? ohhhhh I have to CLICK the ? icon, otherwise it just disappears when I mouse away. hmmm" so maybe we should make it NOT open up on hovering the ? icon, but instead ONLY activate when ? icon is clicked.

instead of the 'x' on clusters being 'release to globs? yes/no', perhaps it should be a two-option decider thing that says "release to globs | delete cluster"...maybe

dragging one cluster on top of another should trigger a "combine clusters?" popup just like the same style as our other confirmation actions, like clicking the merge icon when two clusters are linked.

### Dream Zone ideas

explore the "Shaders" options in the drei docs. especially this one sounds intersting for DreamZone:
https://drei.docs.pmnd.rs/shaders/mesh-wobble-material

<!-- claude 2026-04-24 -->

### Investigate z-fighting flicker on certain GLB objects

Symptoms: random faces on `ss_aqua` (zone-ss-brainfog), some bird sanctuary objects, S.S. Aqua hull plates pop in and out depending on camera angle. Not a recent regression — has happened since site started.

What we tried: enabling `gl={{ logarithmicDepthBuffer: true }}` on both Canvas instances. Didn't fix the flicker, AND introduced a side effect where transparent water depth-test stops working — shark above water reads as a white silhouette, shark below water reads correctly; same for anything above the water surface (TVs, etc). Reverted.

Likely causes still unexplored:

- Coplanar / near-coplanar faces in the source Blender meshes (most likely). Look for accidental duplicate faces, internal walls touching outer hulls, decals laid on top of base geometry without offset.
- Some materials may have `transparent: true` enabled when they shouldn't (auto-set by glTF importer). Worth auditing.
- Tightening `near`/`far` per zone so the depth buffer's precision isn't wasted on empty space.

Do this when motivated to dig into specific Blender meshes, not as part of a general code fix.

### Remember this stuff for focus camera

// Closer-up framing on a small toy:
toy("ct_toy_keyboard", "Keyboard", "cloud_town", {
focusDistance: 6,
})

// Stay-back hero shot for a big zone:
zone("ss_brainfog", "S.S. Brainfog", {
focusDistance: 30,
})

// Skip the focus tween for a moving target:
zone("starlight_zone", "Starlight Zone", {
focusBehavior: "instant",
})

### Remember this too

Translation: ZoneScene auto-plays every clip in the GLB unless the clip targets a toy with animation: "action". The shark isn't an action-toy, so his clip plays. The harpy/weather_report ARE action-toys, so their clips DON'T auto-play here — they get sorted into idle/click by ToyInteractor.

So your mental model needs a small correction: it's not that ToyInteractor "picks the longest as idle" for every toy. That logic only kicks in for toys with animation: "action". For everyone else (like the shark), ZoneScene just plays whatever's in the GLB blindly.

This is fine — it's a useful default — but it means if you ever export a multi-clip Blender animation onto a non-action toy, all clips will play simultaneously forever. So if you ever want multiple clips, set animation: "action".

### make a zone for viewing "about sakhalteam.github.io" that is like a game manual

A game manual / how-to zone (name tbd but it should be clever) that tells not only the user (jojo and nic) how to interact with the site (like what's possible) but also is a one-stop shop for nic's brain to remember all the things that are possible on the site, so he doesn't forget cool features that he built. like what camera options there are, what options do zones, portals, and toys take? also list incomplete/missing/coming-soon zones so it's like a fun virtual museum/help center with both user guide stuff as well as dev stuff for nic. yeeeeeeeeeeeee so meta so cool nic pat on the back pat on the back

<!-- claude 2026-04-25 -->

### Now-completed: camera focus jumpiness in cloud town (✅ shipped 2026-04-23)

Originally listed as "Fix the camera's jumpiness in cloud town" — addressed by useFocusOrbit click-to-fit + per-node focusDistance/focusBehavior. Leaving this here as a note in case it regresses.

<!-- claude 2026-04-25 -->

### Hover-triggered animation (onHover key)

Idea: a toy's animation/sound that plays on cursor hover, separate from click. Use case: cat meows when hovered, plays one of `meowSounds: [...]`; bird ruffles feathers on hover, click does something else.

Design notes when implementing:

- Add `onHover?: ToyAnimation` and possibly `hoverSounds?: string[]` fields to SceneNode (toy-only initially).
- ToyInteractor already tracks hover state in `onPointerMove` — wire a one-shot trigger when `lastHoveredToy` changes from null→toy.
- Debounce rapid hover-on/off (e.g. ignore re-trigger within 500ms) so brushing the cursor over doesn't spam animations.
- Probably should NOT play hover sound while the click sound is currently playing (overlap is annoying). Coordinate via the audio module.
- Open question: do we want hover to also work for zones/portals? Probably yes for sound, no for animation (zones already glow on hover).

<!-- claude 2026-04-25 -->

### Co-animation / interaction graphs (Katamari-style reactions)

Idea: "click flamingo A → flamingos B and C hop too." Or "click cat toy → cat swipes paw at it." Reactions across toys.

This is the big one — needs a real schema decision before coding. Three plausible designs:

1. **Tag-based**: `tags: ["flamingo"]` on each toy, plus `reactsTo: { tag: "flamingo", animation: "hop" }`. Simple, easy to author, breaks down for complex cross-tag interactions.
2. **Proximity-based**: `reactsToNearby: { radius: 5, animation: "hop" }`. Click any toy within radius → others react. Feels organic, harder to predict.
3. **Explicit edges**: `reactsTo: ["bp_toy_flamingo_01", "bp_toy_flamingo_02"]`. Most control, most boilerplate.

Recommendation when this gets real: start with (1) tags + a simple "reactsTo" rule, escalate only if Jojo wants something specific that doesn't fit. Defer until there's a concrete reaction Nic wants to build.

Reactions to consider supporting:

- Animation (hop, wobble) — easy.
- Sound — easy (cycle from `reactSounds: [...]`).
- Idle change ("startled" overrides "idle" for N seconds before reverting) — medium.
- Camera dolly / shake — harder, possibly worth its own field.

<!-- claude 2026-04-25 -->

### Blender clip naming convention for `animation: "action"`

When a toy has `animation: "action"` in sceneMap, ToyInteractor scans the GLB for clips that animate that toy's mesh tree, and sorts them:

- Clip names matching `/idle|loop|cycle/i` → always-on idle loop.
- Everything else → cycles through on click (one per click, like `sounds: [...]` does).

Authoring rule of thumb:

- Idle clip: include `idle` in the name. Examples: `harpy_idle`, `crow_idle_perch`, `cat_idle_breathe`.
- Click clips: avoid the words `idle`, `loop`, `cycle`. Examples: `harpy_loopdeloop` (NOT `loop_de_loop` — would falsely match `loop`), `cat_tail_waggle`, `shutter_open_close`.
- Single-clip toys (e.g. window shutters): name doesn't matter; the system treats one-clip toys as click-only when there's no idle match.

Future tightening option: change the regex from `idle|loop|cycle` → just `idle` for stricter matching, less foot-gun. Currently disabled (Nic prefers to be careful in Blender).

### new zone idea: a zone with a train running through it, like one that you can get to from zone_the_tunnels. on one track in the subway, you get the train that takes you to jr_jingle_journey. on the other track, you get one that takes you to this new zone.

###
