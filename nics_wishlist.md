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

### Fix the camera's jumpiness in cloud town

I had modified the camera behavior to make it feel like I was rotating/orbiting around a local focus point, like in blender where you click an object and hit (.) on the numpad, and it recenters your view and makes it so the zoom in/out doesn't feel like an exercise in futility (that weird phenomenon where you try desperately to zoom into an object in part of the scene, but eventually the zoom just grinds to a halt because of math stuff, but when you recenter your camera you have your scroll/zoom back)

### add lightning to cloud town and fix the clouds in general

'stormy' is a pretty lame excuse for storminess. fix up the everything.

### possible to add multiple 'rolltrigger' sphere hitboxes?

the same way we can have multiple start/finish points, why not have multiple barrel roll triggers scattered throughout the sky? but I don't know how to implement it...

### add visual indicator to direct users towards dream zone

right now dream zone is dropping a ladder down to pool time, but to get users to notice dream zone more, maybe add a simple animated undulating-up-and-down arrow? or like when you hover the ladder it has a little "look up" toast?
