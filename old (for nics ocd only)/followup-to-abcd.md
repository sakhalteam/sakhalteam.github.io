This all makes sense, and I think your pushback on A is correct.

I do NOT think I want a fourth naming category, but I DO think I want a fourth behavior mode.

So: names should stay simple, and behavior should be handled by flags/config.

What I want is:

- zone/portal names for navigation hotspots
- toy names for interactive objects
- separate behavior flags for whether something:
  - belongs to a zone outline group
  - is individually clickable
  - gets its own toy hover outline/label
  - is visually/backgrounded only

So yes: for structural/decorative members like canopy / castle wall / bridge / cranes, I’m good with something like:

- `interactive: false`
- `quiet: true`

Meaning:

- they can still belong to the zone’s outline membership
- but they do NOT get their own gray toy-hover outline
- they do NOT get their own toy label
- they do NOT need to be individually clickable

That solves the “I want it grouped, but not really treated like a toy” issue without inventing another naming system.

## Important hotspot / hitbox decision

For awkward hotspot shapes like the Deku Tree, I do NOT want code trying to infer “the trunk part” from the visible geometry.

Instead I want a dedicated collider/helper mesh approach.

Example:

- visible group root: `zone_bird_sanctuary`
- optional child collider mesh: `zone_bird_sanctuary_hitbox` (or `hitbox_bird_sanctuary`)

Then code should do:

- outline membership = full visible zone object + grouped members
- click hitbox = use dedicated hitbox child if present
- fallback = current bounding-box behavior if no dedicated collider exists

That would let me rejoin the canopy visually and stop playing weird mesh-separation games just to control click area.

Same idea should work for Tower of Knowledge and any future oddly-shaped hotspot.

Also, if a zone root becomes an Empty/group parent in Blender, that’s fine as long as outline mesh collection walks descendants and the hitbox can come from the dedicated collider child.

## My answers to your decisions

### A

Yes:

- use `interactive: false` + `quiet: true` (or equivalent) for structural/background group members
- do NOT force those to be full toys just because they participate in zone outline grouping

### B

- `toy_lion_statue_left` / `toy_lion_statue_right` → yes, rename to:
  - `i_toy_lion_statue_left`
  - `i_toy_lion_statue_right`
    and add placeholder sceneMap entries now
- `zone_the_tunnels_01` / `_02` → keep as-is if current numeric stripping already handles them cleanly

### C

Yes, proceed with the same cleanup for zone-scene GLBs.

### D

Yes, I agree with using `sceneMap.parent` as the actual grouping authority.

That feels better than prefix parsing.

So:

- prefixes remain human-readable hints
- exact GLB names match exact sceneMap keys
- `parent` decides outline grouping / containment
- no backward-compat bridge needed

## One extra nuance

For multipart objects that are conceptually one thing (example: crystal pieces like head/skirt/base), I’d rather not create fake separate “toy” identities for every submesh if they’re really one object.

So if possible, please treat those as one logical object where appropriate, with descendant meshes collected under that one logical entry, instead of exploding every structural subpiece into separate interactives.

## Proposed next step

Please go ahead and produce the full rename list for all 3 GLBs using this model:

- island standalone toys: `i_toy_*`
- island grouped toys: `i_<zoneName>_toy_*`
- zone-scene toys: `<zoneName>_toy_*`
- structural/background grouped members can still have sceneMap entries if needed, but marked non-interactive/quiet
- zone grouping authority comes from `sceneMap.parent`
- dedicated optional `*_hitbox` child mesh for awkward zone triggers

Then I’ll do the Blender rename/re-export pass and run optimize, and after that you can ship the code rewrite in one go.
