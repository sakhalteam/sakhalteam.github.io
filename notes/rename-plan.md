# GLB rename plan

Execute in Blender, re-export all 3 GLBs, then run `npm run optimize`.
After that, Claude ships the matching code rewrite in one commit.

## Conventions

- `zone_<name>` — zone doorway (unchanged)
- `portal_<name>` — external portal (unchanged)
- `i_toy_<name>` — standalone island toy
- `i_<zoneKey>_toy_<name>` — island toy grouped with a zone or portal doorway
- `<zoneKey>_toy_<name>` — toy inside a zone's own GLB
- `<zone_name>_hitbox` — optional child mesh for click collider (overrides bbox)
- Grouping authority = sceneMap `parent` field (prefix is human hint only)

## Behavior flags (new in sceneMap)

Added to toy entries:

- `interactive: false` — skip click handling (no animation, no sound trigger)
- `quiet: true` — skip own hover outline + label (but still belongs to parent zone's outline group)

Default = fully interactive toy.

---

## island.glb

### Zone doorways (no change)

```
zone_bird_sanctuary
zone_ss_brainfog
zone_cloud_town
zone_tower_of_knowledge
zone_pokemon_island
zone_the_tunnels_01
zone_the_tunnels_02
zone_beach_party
zone_crystals
zone_flower_shop
zone_mystery_zone
zone_nessie
zone_warehouse
portal_famima
```

### Standalone island toys → `i_toy_*`

| Current                  | New                        |
| ------------------------ | -------------------------- |
| `toy_pigeon_01`          | `i_toy_pigeon_01`          |
| `toy_pigeon_02`          | `i_toy_pigeon_02`          |
| `toy_dinosaur_statue`    | `i_toy_dinosaur_statue`    |
| `toy_harpy`              | `i_toy_harpy`              |
| `toy_egg_green`          | `i_toy_egg_green`          |
| `toy_egg_pink`           | `i_toy_egg_pink`           |
| `toy_vending_machine_01` | `i_toy_vending_machine_01` |
| `toy_vending_machine_02` | `i_toy_vending_machine_02` |
| `toy_lion_statue_left`   | `i_toy_lion_statue_left`   |
| `toy_lion_statue_right`  | `i_toy_lion_statue_right`  |

### Beach Party group (parent: `beach_party`)

| Current                                    | New                                |
| ------------------------------------------ | ---------------------------------- |
| `zc_toy_beach_party_pokemon_mudkip`        | `i_beach_party_toy_mudkip`         |
| `zc_toy_beach_party_pokemon_squirtle`      | `i_beach_party_toy_squirtle`       |
| `zc_toy_beach_party_object_beach_ball`     | `i_beach_party_toy_beach_ball`     |
| `zc_toy_beach_party_object_beach_chair`    | `i_beach_party_toy_beach_chair`    |
| `zc_toy_beach_party_object_cooler`         | `i_beach_party_toy_cooler`         |
| `zc_toy_beach_party_object_beach_umbrella` | `i_beach_party_toy_umbrella`       |
| `zc_toy_beach_party_object_beach_towel_01` | `i_beach_party_toy_beach_towel_01` |
| `zc_toy_beach_party_object_beach_towel_02` | `i_beach_party_toy_beach_towel_02` |
| `zc_toy_beach_party_bird_flamingo.A`       | `i_beach_party_toy_flamingo_01`    |
| `zc_toy_beach_party_bird_flamingo_B`       | `i_beach_party_toy_flamingo_02`    |

### Bird Sanctuary group (parent: `bird_sanctuary`)

| Current                             | New                                                             |
| ----------------------------------- | --------------------------------------------------------------- |
| `toy_bird_sanctuary_bird_cassowary` | `i_bird_sanctuary_toy_cassowary`                                |
| `toy_bird_sanctuary_eagle`          | `i_bird_sanctuary_toy_eagle`                                    |
| `toy_american_robin`                | `i_bird_sanctuary_toy_american_robin`                           |
| `toy_baltimore_oriole`              | `i_bird_sanctuary_toy_baltimore_oriole`                         |
| `toy_blue_jay`                      | `i_bird_sanctuary_toy_blue_jay`                                 |
| `toy_northern_cardinal`             | `i_bird_sanctuary_toy_northern_cardinal`                        |
| `toy_king_egg`                      | `i_bird_sanctuary_toy_king_egg`                                 |
| `zc_bird_sanctuary_deku_canopy`     | `i_bird_sanctuary_toy_deku_canopy` **(quiet, non-interactive)** |

**Optional:** add a dedicated `zone_bird_sanctuary_hitbox` child mesh (a simple cube at the trunk base). If present, code uses that for clicks and you can rejoin the canopy as a child of `zone_bird_sanctuary`.

### Nessie group (parent: `nessie`)

| Current                             | New                                               |
| ----------------------------------- | ------------------------------------------------- |
| `toy_nessie_object_nessie_hat`      | `i_nessie_toy_hat`                                |
| `toy_nessie_object_nessie_umbrella` | `i_nessie_toy_umbrella`                           |
| `zc_nessie_crane`                   | `i_nessie_toy_crane` **(quiet, non-interactive)** |

### Famima group (parent: `famima` — a portal, not a zone)

| Current                     | New                            |
| --------------------------- | ------------------------------ |
| `toy_pizza`                 | `i_famima_toy_pizza`           |
| `toy_ramen`                 | `i_famima_toy_ramen`           |
| `pc_famima_flamingo`        | `i_famima_toy_flamingo`        |
| `pc_famima_vending_machine` | `i_famima_toy_vending_machine` |

### Pokemon Island group (parent: `pokemon_island`)

| Current                           | New                                                        |
| --------------------------------- | ---------------------------------------------------------- |
| `toy_diglett`                     | `i_pokemon_island_toy_diglett`                             |
| `toy_staryu`                      | `i_pokemon_island_toy_staryu`                              |
| `toy_lapras`                      | `i_pokemon_island_toy_lapras`                              |
| `toy_pollywag`                    | `i_pokemon_island_toy_pollywag`                            |
| `zc_pokemon_island_object_bridge` | `i_pokemon_island_toy_bridge` **(quiet, non-interactive)** |

### Tower of Knowledge group (parent: `tower_of_knowledge`)

| Current                                              | New                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `zc_tower_of_knowledge_CRYSTAL_PARENT`               | `i_tower_of_knowledge_toy_crystal`                                     |
| `zc_tower_of_knowledge_character_cat_dingus`         | `i_tower_of_knowledge_toy_cat_dingus`                                  |
| `zc_tower_of_knowledge_character_cat_midge`          | `i_tower_of_knowledge_toy_cat_midge`                                   |
| `zc_tower_of_knowledge_character_cat_croissant`      | `i_tower_of_knowledge_toy_cat_croissant`                               |
| `zc_tower_of_knowledge_character_cat_benchcats`      | `i_tower_of_knowledge_toy_cat_benchcats`                               |
| `zc_tower_of_knowledge_object_blue_mushroom`         | `i_tower_of_knowledge_toy_blue_mushroom`                               |
| `zc_tower_of_knowledge_object_white_mushroom`        | `i_tower_of_knowledge_toy_white_mushroom`                              |
| `zc_tower_of_knowledge_object_fish_on_cutting_board` | `i_tower_of_knowledge_toy_fish_on_cutting_board`                       |
| `zc_tower_of_knowledge_extra_castle_wall`            | `i_tower_of_knowledge_toy_castle_wall` **(quiet, non-interactive)**    |
| `zc_tower_of_knowledge_object_stonewallpatch`        | `i_tower_of_knowledge_toy_stonewallpatch` **(quiet, non-interactive)** |

**Save point pieces — reparent in Blender:**

Currently 3 separate scene-root objects. Create an Empty named `i_tower_of_knowledge_toy_save_point` and parent all three under it:

- `zc_tower_of_knowledge_object_save_point_crystal` → (child of new empty, any name)
- `zc_tower_of_knowledge_object_save_point_head` → (child of new empty, any name)
- `zc_tower_of_knowledge_object_save_point_skirt` → (child of new empty, any name)

The result: one logical toy `i_tower_of_knowledge_toy_save_point`, descendant meshes auto-collected.

### Coming-soon crane zones (parent: `<zoneKey>`)

All quiet/non-interactive (deferred until Bug #9 crane fix):

| Current                 | New                        |
| ----------------------- | -------------------------- |
| `zc_crystals_crane.004` | `i_crystals_toy_crane`     |
| `zc_flower_shop_crane`  | `i_flower_shop_toy_crane`  |
| `zc_mystery_zone_crane` | `i_mystery_zone_toy_crane` |

---

## zone_beach_party.glb

Drop the `zc_` prefix entirely. No dedicated zone doorway inside (this IS the beach party scene), so toys live at scene root with the new convention.

| Current                                | New                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `portal_nikbeat`                       | **unchanged**                                                            |
| `zc_beach_party_beach`                 | `beach_party_toy_beach` **(quiet, non-interactive)** — whole sand ground |
| `zc_beach_party_character_mudkip`      | `beach_party_toy_mudkip`                                                 |
| `zc_beach_party_character_squirtle`    | `beach_party_toy_squirtle`                                               |
| `zc_beach_party_bird_flamingo.001`     | `beach_party_toy_flamingo_01`                                            |
| `zc_beach_party_bird_flamingo_01`      | `beach_party_toy_flamingo_02`                                            |
| `zc_beach_party_object_beach_ball`     | `beach_party_toy_beach_ball`                                             |
| `zc_beach_party_object_beach_chair`    | `beach_party_toy_beach_chair`                                            |
| `zc_beach_party_object_beach_towel_01` | `beach_party_toy_beach_towel_01`                                         |
| `zc_beach_party_object_beach_towel_02` | `beach_party_toy_beach_towel_02`                                         |
| `zc_beach_party_object_beach_umbrella` | `beach_party_toy_umbrella`                                               |
| `zc_beach_party_object_cooler`         | `beach_party_toy_cooler`                                                 |

**Duplicate flamingo warning:** The GLB currently has `.001` (dot-notation Blender duplicate) + `_01` (intentional). In Blender, confirm these are 2 distinct flamingos and rename both clearly as `_01` / `_02`.

---

## zone_bird_sanctuary.glb

| Current             | New                           |
| ------------------- | ----------------------------- |
| `portal_bird_bingo` | **unchanged**                 |
| `bs_toy_chocobo`    | `bird_sanctuary_toy_chocobo`  |
| `bs_toy_flamingo`   | `bird_sanctuary_toy_flamingo` |
| `bs_toy_kiwi_01`    | `bird_sanctuary_toy_kiwi_01`  |
| `bs_toy_kiwi_02`    | `bird_sanctuary_toy_kiwi_02`  |
| `bs_toy_ostrich`    | `bird_sanctuary_toy_ostrich`  |
| `bs_toy_penguin`    | `bird_sanctuary_toy_penguin`  |
| `bs_toy_puffin`     | `bird_sanctuary_toy_puffin`   |

---

## After the Blender pass

1. Re-export all 3 GLBs (keep original filenames: `island.glb`, `zone_beach_party.glb`, `zone_bird_sanctuary.glb`)
2. `npm run optimize`
3. Let Claude know — I'll ship the code migration (sceneMap + IslandScene + ZoneScene + ToyInteractor) in one commit
4. btw claude I've also re-exported zone_cloud_town.glb with new name conventions. please check through it.
5. also, I've rejoined the deku tree within zone_bird_sanctuary.glb and added a dummy "portal_bird_bingo_hitbox" for you to use just like the deku tree hitbox on island.glb
6. also, I've renamed zone_reading_room.glb items. please add them to scenemap as well. the portal_proto_typing is for a yet-unreleased minigame site called "Proto-Typing". add this to my TODO.md somewhere.
7. also renamed all zone_pokemon_island.glb objects. please update scenemap with these as well.

## Code migration preview (so you know what's coming)

- **sceneMap.ts**: all toy keys updated, `interactive` + `quiet` flags added to `toy()` helper
- **ToyInteractor.tsx**: drops prefix-scanning (`toy_`/`bs_toy_`/`zc_`/`pc_`). Traverses scene, calls `getToyConfig(name)` per object, registers if config exists. Respects `interactive: false` (skip click) and `quiet: true` (skip label + hover outline emit)
- **IslandScene.tsx**: `buildZoneMarkers` uses sceneMap `parent` to find outline-group members. Drops all `zc_`/`pc_` scanning. Optional `<zone_name>_hitbox` child mesh overrides bbox. `MAX_HITBOX_HEIGHT` cap removed
- **ZoneScene.tsx**: similar simplification
