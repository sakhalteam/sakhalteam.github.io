# Message to Claude: naming convention + migration plan

Here’s where I’ve landed after reviewing `sceneMap.ts`, `IslandScene.tsx`, and `ZoneScene.tsx`, plus talking it through carefully.

I think the real cleanup is to stop mixing multiple naming systems and standardize around one clear model.

## Core rule

I **do not** want a separate class of object that is “outline-member but not toy.”

If something exists on the **island** and is **not** a zone doorway, I want it to be treated as a **toy / clickable object**, even if it doesn’t yet have sound or animation.

So conceptually the island should just have:

1. **Zone doorways**
2. **Standalone island toys**
3. **Island toys associated with a zone doorway**
   - these should still be toys/clickable
   - and they should also be members of that doorway’s outline group

## Proposed naming convention

### Island

- `zone_<name>` = island doorway / zone trigger
- `i_toy_<name>` = standalone island toy
- `i_<zoneName>_toy_<name>` = island toy associated with a specific zone doorway / outline group

### Zone scenes

- `portal_<name>` = portal object inside a zone scene
- `<zoneName>_toy_<name>` = toy inside that zone scene

## Examples

### Island examples

- `zone_beach_party`
- `i_toy_pigeon_01`
- `i_toy_pigeon_02`
- `i_beach_party_toy_mudkip`
- `i_beach_party_toy_squirtle`
- `i_beach_party_toy_beach_ball`
- `i_nessie_toy_hat`
- `i_nessie_toy_umbrella`
- `i_bird_sanctuary_toy_cassowary`
- `i_pokemon_island_toy_lapras`

### Zone-scene examples

- `portal_nikbeat`
- `beach_party_toy_mudkip`
- `beach_party_toy_beach_chair`
- `bird_sanctuary_toy_cassowary`

The reason I want island toys and zone-scene toys distinguished is that they may eventually have different behavior.
For example:

- island Mudkip might just do a tiny hop
- Beach Party scene Mudkip might do a more detailed dance

So I want those to be separate objects with separate config keys.

## Important behavioral rule

I do **not** want naming to encode every behavior directly.

I want naming to encode:

- island vs zone-scene
- doorway vs toy
- whether an island toy belongs to a zone-group

Then code can decide:

- whether it currently glows with that zone
- whether it has sound yet
- whether it has animation yet
- whether it currently does nothing except stay future-proof

## What I want to remove

I want to move away from these mixed legacy-ish categories:

- `zc_*`
- `pc_*`
- `toy_bird_sanctuary_*`
- `toy_nessie_object_*`
- other one-off naming patterns that are really encoding grouping/history rather than the stable object role

In other words: I want to stop using `zc_` / `pc_` as meaning-bearing categories in island naming.

## Migration direction

### Keep

- `zone_<name>`
- `portal_<name>`

### Standardize island toys into

- `i_toy_<name>`
- `i_<zoneName>_toy_<name>`

### Standardize zone-scene toys into

- `<zoneName>_toy_<name>`

## How I want island grouping to work

Right now `IslandScene.tsx` is still using `zone_` + `zc_` matching to decide grouped outline membership.

I want that refactored so island grouping no longer depends on `zc_` / `pc_` names.

I’m open to either of these approaches:

### Option A: derive group membership from prefix

Example:

- all `i_beach_party_toy_*` glow with `zone_beach_party`
- all `i_bird_sanctuary_toy_*` glow with `zone_bird_sanctuary`

### Option B: explicit config in code

Example:

```ts
outlineMembers: [
  "i_beach_party_toy_mudkip",
  "i_beach_party_toy_squirtle",
  "i_beach_party_toy_beach_ball",
];
```

My instinct is:

- use names to encode **identity/context**
- use code to encode **behavior**
- so explicit config may be safer than overloading parsing logic too much

But if derived grouping is clean and reliable, I’m okay with that too.

## What I want from you

Please help me do this in a clean order:

### 1. Sanity-check the convention

Tell me whether this naming scheme is good, or whether you see a cleaner variant.

### 2. Give me an exact Blender rename plan

Please list the current island objects that should be renamed, and what each should become.

### 3. Give me the code migration plan

Please tell me what should change in:

- `sceneMap.ts`
- `IslandScene.tsx`
- `ZoneScene.tsx`
- `ToyInteractor.tsx` (if needed)

### 4. Prefer exact key matching over magical parsing

Where possible, I’d rather have:

- exact object names in Blender
- exact matching keys in `sceneMap`

…instead of adding lots of helper logic that tries to infer intent from old prefixes.

## Concrete examples from current island naming that I want normalized

Examples of the kind of cleanup I mean:

- `zc_toy_beach_party_pokemon_mudkip` → `i_beach_party_toy_mudkip`
- `zc_toy_beach_party_pokemon_squirtle` → `i_beach_party_toy_squirtle`
- `zc_toy_beach_party_object_beach_ball` → `i_beach_party_toy_beach_ball`
- `zc_toy_beach_party_object_beach_chair` → `i_beach_party_toy_beach_chair`
- `zc_toy_beach_party_object_cooler` → `i_beach_party_toy_cooler`
- `zc_toy_beach_party_object_beach_umbrella` → `i_beach_party_toy_umbrella`
- `zc_toy_beach_party_object_beach_towel_01` → `i_beach_party_toy_beach_towel_01`
- `zc_toy_beach_party_object_beach_towel_02` → `i_beach_party_toy_beach_towel_02`
- `zc_toy_beach_party_bird_flamingo.a` → `i_beach_party_toy_flamingo_01`
- `zc_toy_beach_party_bird_flamingo_b` → `i_beach_party_toy_flamingo_02`

- `zc_tower_of_knowledge_crystal_parent` → `i_tower_of_knowledge_toy_crystal`
- `zc_tower_of_knowledge_character_cat_dingus` → `i_tower_of_knowledge_toy_cat_dingus`
- `zc_tower_of_knowledge_character_cat_midge` → `i_tower_of_knowledge_toy_cat_midge`
- `zc_tower_of_knowledge_character_cat_croissant` → `i_tower_of_knowledge_toy_cat_croissant`
- `zc_tower_of_knowledge_character_cat_benchcats` → `i_tower_of_knowledge_toy_cat_benchcats`
- `zc_tower_of_knowledge_object_blue_mushroom` → `i_tower_of_knowledge_toy_blue_mushroom`
- `zc_tower_of_knowledge_object_white_mushroom` → `i_tower_of_knowledge_toy_white_mushroom`

- `pc_famima_flamingo` → `i_famima_toy_flamingo`
- `pc_famima_vending_machine` → `i_famima_toy_vending_machine`

- `toy_bird_sanctuary_bird_cassowary` → `i_bird_sanctuary_toy_cassowary`
- `toy_bird_sanctuary_eagle` → `i_bird_sanctuary_toy_eagle`
- `toy_american_robin` → `i_bird_sanctuary_toy_american_robin`
- `toy_baltimore_oriole` → `i_bird_sanctuary_toy_baltimore_oriole`
- `toy_blue_jay` → `i_bird_sanctuary_toy_blue_jay`
- `toy_northern_cardinal` → `i_bird_sanctuary_toy_northern_cardinal`
- `toy_king_egg` → `i_bird_sanctuary_toy_king_egg`

- `toy_nessie_object_nessie_hat` → `i_nessie_toy_hat`
- `toy_nessie_object_nessie_umbrella` → `i_nessie_toy_umbrella`

- `toy_pizza` → `i_famima_toy_pizza`
- `toy_ramen` → `i_famima_toy_ramen`

- `toy_diglett` → `i_pokemon_island_toy_diglett`
- `toy_lapras` → `i_pokemon_island_toy_lapras`
- `toy_pollywag` → `i_pokemon_island_toy_pollywag`
- `toy_staryu` → `i_pokemon_island_toy_staryu`

- `toy_pigeon_01` → `i_toy_pigeon_01`
- `toy_pigeon_02` → `i_toy_pigeon_02`
- `toy_dinosaur_statue` → `i_toy_dinosaur_statue`
- `toy_harpy` → `i_toy_harpy`
- `toy_egg_green` → `i_toy_egg_green`
- `toy_egg_pink` → `i_toy_egg_pink`
- `toy_vending_machine_01` → `i_toy_vending_machine_01`
- `toy_vending_machine_02` → `i_toy_vending_machine_02`

## Bottom line

What I want is:

- no “outline-member but not toy” category on the island
- all non-doorway island interactives are toys
- zone-associated island toys should be obvious from the name
- zone-scene toys should be distinct from island toys
- the whole system should be future-proof, boring, and easy to reason about for me and future Claudes

If you agree, please give me:

1. the exact rename list for Blender
2. the exact code changes you want to make afterward
3. your recommendation on prefix-derived grouping vs explicit outline-member config
