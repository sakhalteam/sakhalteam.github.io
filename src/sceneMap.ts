// sceneMap.ts

/**
 * sceneMap.ts — single source of truth for the entire site navigation tree.
 *
 * Naming model (see notes/rename-plan.md for the migration story):
 *   zone_<key>                    zone doorway (loads a scene)
 *   portal_<key>                  external portal (loads a URL)
 *   i_toy_<name>                  standalone island toy
 *   i_<zoneKey>_toy_<name>        island toy grouped with a zone/portal
 *   <zoneKey>_toy_<name>          toy inside a zone's own GLB
 *   <zone_name>_hitbox            optional click collider (overrides bbox)
 *
 * Keys stored here:
 *   zones/portals are keyed by their STRIPPED name (no "zone_"/"portal_" prefix).
 *   Toys are keyed by their FULL object name.
 *   parent references use stripped keys for zones/portals.
 */

export type NodeType = "zone" | "portal" | "toy" | "site";
export type ToyAnimation =
  | "spin"
  | "hop"
  | "wobble"
  | "grow"
  | "bob"
  | "none"
  | "action";
export type ToyIdle = "float" | "none";

export interface SceneNode {
  key: string;
  label: string;
  type: NodeType;
  path: string | null;
  url: string | null;
  glbPath: string | null;
  environmentPreset?: string;
  parent: string | null;
  children: string[];
  sounds?: string[];
  sound?: string;
  animation?: ToyAnimation;
  idle?: ToyIdle;
  /** If false, toy is not clickable and has no animation/sound — pure outline-group member. */
  interactive?: boolean;
  /** If true, toy does not render its own label and does not emit a toy hover outline. Still belongs to parent's outline group. */
  quiet?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function zone(
  key: string,
  label: string,
  opts: {
    path?: string | null;
    glbPath?: string | null;
    env?: string;
    parent?: string;
    children?: string[];
    sounds?: string[];
  } = {},
): SceneNode {
  return {
    key,
    label,
    type: "zone",
    path:
      opts.path === null
        ? null
        : (opts.path ?? `/zone-${key.replace(/_/g, "-")}`),
    url: null,
    glbPath:
      opts.glbPath === null ? null : (opts.glbPath ?? `/zones/zone_${key}.glb`),
    environmentPreset: opts.env ?? "night",
    parent: opts.parent ?? "island",
    children: opts.children ?? [],
    ...(opts.sounds && { sounds: opts.sounds }),
  };
}

function portal(
  key: string,
  label: string,
  url: string,
  parent: string,
): SceneNode {
  return {
    key,
    label,
    type: "portal",
    path: null,
    url,
    glbPath: null,
    parent,
    children: [],
  };
}

function toy(
  key: string,
  label: string,
  parent: string,
  opts: {
    sound?: string;
    animation?: ToyAnimation;
    idle?: ToyIdle;
    interactive?: boolean;
    quiet?: boolean;
  } = {},
): SceneNode {
  return {
    key,
    label,
    type: "toy",
    path: null,
    url: null,
    glbPath: null,
    parent,
    children: [],
    ...(opts.sound && { sound: opts.sound }),
    ...(opts.animation && { animation: opts.animation }),
    ...(opts.idle && { idle: opts.idle }),
    ...(opts.interactive === false && { interactive: false }),
    ...(opts.quiet === true && { quiet: true }),
  };
}

function site(key: string, label: string, url: string): SceneNode {
  return {
    key,
    label,
    type: "site",
    path: null,
    url,
    glbPath: null,
    parent: null,
    children: [],
  };
}

/** PokeAPI cry CDN — Pokemon cries by National Dex ID */
const cry = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;

/** Shortcut for structural/decorative members — quiet, non-interactive grouping member. */
const structural = (
  key: string,
  label: string,
  parent: string,
): SceneNode =>
  toy(key, label, parent, { interactive: false, quiet: true });

// ─── The map ────────────────────────────────────────────────────────

const nodes: SceneNode[] = [
  // ── Island (root) ──────────────────────────────────
  {
    key: "island",
    label: "Sakhalteam",
    type: "zone",
    path: "/",
    url: null,
    glbPath: "/island.glb",
    environmentPreset: "night",
    parent: null,
    children: [
      // Zones
      "bird_sanctuary",
      "ss_brainfog",
      "cloud_town",
      "tower_of_knowledge",
      "pokemon_island",
      "the_tunnels",
      "beach_party",
      // Coming-soon zones (no glb yet)
      "mystery_zone",
      "nessie",
      "flower_shop",
      "warehouse",
      "crystals",
      // Portals directly on the island
      "famima",
      // Standalone island toys
      "i_toy_pigeon_01",
      "i_toy_pigeon_02",
      "i_toy_dinosaur_statue",
      "i_toy_harpy",
      "i_toy_egg_green",
      "i_toy_egg_pink",
      "i_toy_vending_machine_01",
      "i_toy_vending_machine_02",
      "i_toy_lion_statue_left",
      "i_toy_lion_statue_right",
    ],
  },

  // ── Active zones (have GLBs + routes) ──────────────
  zone("bird_sanctuary", "Bird Sanctuary", {
    env: "forest",
    children: [
      "portal_bird_bingo",
      "bird_sanctuary_toy_chocobo",
      "bird_sanctuary_toy_flamingo",
      "bird_sanctuary_toy_kiwi_01",
      "bird_sanctuary_toy_kiwi_02",
      "bird_sanctuary_toy_ostrich",
      "bird_sanctuary_toy_penguin",
      "bird_sanctuary_toy_puffin",
      "bird_sanctuary_toy_baby_deku",
      "bird_sanctuary_toy_tree_stump",
    ],
  }),
  zone("ss_brainfog", "S.S. Brainfog", {
    env: "sunset",
    children: [
      "portal_adhdo",
      "portal_karasu_drop",
      "ss_brainfog_toy_shark",
      "ss_brainfog_toy_ss_aqua",
    ],
  }),
  zone("cloud_town", "Cloud Town", {
    env: "city",
    children: [
      "portal_weather_report",
      "cloud_town_toy_ladder",
      "cloud_town_toy_metal_gear_rex",
      "cloud_town_toy_keyboard",
      "dream_zone",
      "pool_time",
    ],
  }),
  zone("tower_of_knowledge", "Tower Of Knowledge", {
    env: "apartment",
    children: ["reading_room", "dojo"],
  }),
  zone("reading_room", "Reading Room", {
    env: "apartment",
    parent: "tower_of_knowledge",
    children: [
      "portal_japanese_articles",
      "portal_proto_typing",
      "reading_room_toy_TV",
      "reading_room_toy_bed",
      "reading_room_toy_nes",
    ],
  }),
  zone("dojo", "Dojo", {
    env: "night",
    parent: "tower_of_knowledge",
  }),
  zone("pokemon_island", "Pokemon Island", {
    env: "park",
    children: [
      "portal_pokemon_park",
      "pokemon_island_toy_ekans",
      "pokemon_island_toy_espeon",
      "pokemon_island_toy_glaceon",
      "pokemon_island_toy_goldeen",
      "pokemon_island_toy_haunter",
      "pokemon_island_toy_ho_oh",
      "pokemon_island_toy_horsea",
      "pokemon_island_toy_krabby",
      "pokemon_island_toy_lapras",
      "pokemon_island_toy_map",
      "pokemon_island_toy_metapod",
      "pokemon_island_toy_mew",
      "pokemon_island_toy_nidoking",
      "pokemon_island_toy_nidoqueen",
      "pokemon_island_toy_ninetails",
      "pokemon_island_toy_oddish_01",
      "pokemon_island_toy_oddish_02",
      "pokemon_island_toy_omanyte",
      "pokemon_island_toy_psyduck",
      "pokemon_island_toy_rapidash",
      "pokemon_island_toy_squirtle_01",
      "pokemon_island_toy_squirtle_02",
      "pokemon_island_toy_staryu_01",
      "pokemon_island_toy_staryu_02",
      "pokemon_island_toy_staryu_03",
      "pokemon_island_toy_staryu_04",
      "pokemon_island_toy_umbreon",
    ],
  }),
  zone("the_tunnels", "The Tunnels", {
    env: "night",
    children: ["portal_jr_jingle_journey"],
  }),
  zone("beach_party", "Beach Party", {
    env: "sunset",
    children: [
      "portal_nikbeat",
      "beach_party_toy_beach",
      "beach_party_toy_mudkip",
      "beach_party_toy_squirtle",
      "beach_party_toy_flamingo_01",
      "beach_party_toy_flamingo_02",
      "beach_party_toy_beach_ball",
      "beach_party_toy_beach_chair",
      "beach_party_toy_beach_towel_01",
      "beach_party_toy_beach_towel_02",
      "beach_party_toy_beach_umbrella",
      "beach_party_toy_cooler",
    ],
  }),

  // ── Coming-soon zones ──────────────────────────────
  // On the island (no GLB yet):
  zone("mystery_zone", "Mystery Zone", {
    glbPath: null,
    path: null,
    sounds: ["/sounds/thwomp_01.ogg", "/sounds/thwomp_02.ogg"],
  }),
  zone("nessie", "Nessie", {
    glbPath: null,
    path: null,
    children: [
      "i_nessie_toy_hat",
      "i_nessie_toy_umbrella",
      "i_nessie_toy_crane",
    ],
  }),
  zone("flower_shop", "Flower Shop", {
    glbPath: null,
    path: null,
    children: ["i_flower_shop_toy_crane"],
  }),
  zone("warehouse", "Warehouse", {
    glbPath: null,
    path: null,
    sounds: ["/sounds/zone_warehouse.mp3"],
  }),
  zone("crystals", "Crystals", {
    glbPath: null,
    path: null,
    sounds: ["/sounds/zone_crystals.mp3"],
    children: ["i_crystals_toy_crane"],
  }),
  // Inside Cloud Town scene (no GLB yet):
  zone("dream_zone", "Dream Zone", {
    glbPath: null,
    path: null,
    parent: "cloud_town",
  }),
  zone("pool_time", "Pool Time", {
    glbPath: null,
    path: null,
    parent: "cloud_town",
  }),

  // Grouping on the island via sceneMap.parent:
  // Portals that host island toys need entries even though they just link out.
  // tower_of_knowledge, pokemon_island, beach_party, bird_sanctuary hold
  // island toys via parent field — those are real zones, handled above.
  // famima + mystery_zone are where island toys (and cranes) attach.
  // famima is a portal, already defined below under portals.

  // ── Portals ────────────────────────────────────────
  portal("bird_bingo", "Bird Bingo", "/bird-bingo/", "bird_sanctuary"),
  portal("adhdo", "ADHDO", "/adhdo/", "ss_brainfog"),
  portal("karasu_drop", "Karasu Drop", "/karasu-drop/", "ss_brainfog"),
  portal("japanese_articles", "Japanese Articles", "/japanese-articles/", "reading_room"),
  portal("proto_typing", "Proto-Typing", "/proto-typing/", "reading_room"),
  portal("nikbeat", "NikBeat", "/nikbeat/", "beach_party"),
  portal("pokemon_park", "Pokemon Park", "/pokemon-park/", "pokemon_island"),
  portal("weather_report", "Weather Report", "/weather-report/", "cloud_town"),
  portal("famima", "Family Mart", "/famima/", "island"),
  portal(
    "jr_jingle_journey",
    "JR Jingle Journey",
    "/jr-jingle-journey/",
    "the_tunnels",
  ),

  // Famima children (island toys grouped with portal_famima):
  // Registered as children of the famima portal node for completeness.
  // Actual membership resolved via sceneMap.parent === "famima".

  // ── Standalone island toys (parent: island) ────────
  toy("i_toy_pigeon_01", "Pigeon", "island", {
    sound: "/sounds/rock-pigeon-call.mp3",
    animation: "hop",
  }),
  toy("i_toy_pigeon_02", "Pigeon", "island", {
    sound: "/sounds/rock-pigeon-call.mp3",
    animation: "hop",
  }),
  toy("i_toy_dinosaur_statue", "Dinosaur", "island", {
    sound: "/sounds/toy_dinosaur_statue.mp3",
    animation: "none",
  }),
  toy("i_toy_harpy", "Harpy", "island", { animation: "action" }),
  toy("i_toy_egg_green", "Green Egg", "island", { animation: "hop" }),
  toy("i_toy_egg_pink", "Pink Egg", "island", { animation: "hop" }),
  toy("i_toy_vending_machine_01", "Vending Machine", "island", {
    sound: "/sounds/vending_machine.mp3",
  }),
  toy("i_toy_vending_machine_02", "Vending Machine", "island", {
    sound: "/sounds/vending_machine.mp3",
  }),
  toy("i_toy_lion_statue_left", "Lion Statue", "island"),
  toy("i_toy_lion_statue_right", "Lion Statue", "island"),

  // ── Beach Party group (parent: beach_party) ────────
  toy("i_beach_party_toy_mudkip", "Mudkip", "beach_party", {
    sound: "/sounds/mudkip.ogg",
    animation: "hop",
  }),
  toy("i_beach_party_toy_squirtle", "Squirtle", "beach_party", {
    sound: "/sounds/squirtle.ogg",
    animation: "hop",
  }),
  toy("i_beach_party_toy_beach_ball", "Beach Ball", "beach_party"),
  toy("i_beach_party_toy_beach_chair", "Beach Chair", "beach_party"),
  toy("i_beach_party_toy_cooler", "Cooler", "beach_party", {
    sound: "/sounds/zc_toy_beach_party_object_cooler.mp3",
  }),
  toy("i_beach_party_toy_umbrella", "Umbrella", "beach_party"),
  toy("i_beach_party_toy_beach_towel_01", "Beach Towel", "beach_party"),
  toy("i_beach_party_toy_beach_towel_02", "Beach Towel", "beach_party"),
  toy("i_beach_party_toy_flamingo_01", "Flamingo", "beach_party", {
    sound: "/sounds/american-flamingo-call.mp3",
  }),
  toy("i_beach_party_toy_flamingo_02", "Flamingo", "beach_party", {
    sound: "/sounds/american-flamingo-call.mp3",
  }),

  // ── Bird Sanctuary group on island (parent: bird_sanctuary) ──
  toy("i_bird_sanctuary_toy_cassowary", "Cassowary", "bird_sanctuary", {
    sound: "/sounds/southern-cassowary-call.mp3",
    animation: "wobble",
  }),
  toy("i_bird_sanctuary_toy_eagle", "Eagle", "bird_sanctuary", {
    sound: "/sounds/red-tailed-hawk-call.mp3",
    animation: "bob",
  }),
  toy("i_bird_sanctuary_toy_american_robin", "American Robin", "bird_sanctuary", {
    sound: "/sounds/american-robin-call.mp3",
    animation: "hop",
  }),
  toy("i_bird_sanctuary_toy_baltimore_oriole", "Baltimore Oriole", "bird_sanctuary", {
    sound: "/sounds/baltimore-oriole-call.mp3",
    animation: "hop",
  }),
  toy("i_bird_sanctuary_toy_blue_jay", "Blue Jay", "bird_sanctuary", {
    sound: "/sounds/blue-jay-call.mp3",
    animation: "hop",
  }),
  toy("i_bird_sanctuary_toy_northern_cardinal", "Northern Cardinal", "bird_sanctuary", {
    sound: "/sounds/northern-cardinal-call.mp3",
    animation: "hop",
  }),
  toy("i_bird_sanctuary_toy_king_egg", "King Egg", "bird_sanctuary", {
    animation: "hop",
  }),

  // ── Nessie group on island (parent: nessie) ────────
  toy("i_nessie_toy_hat", "Hat", "nessie"),
  toy("i_nessie_toy_umbrella", "Umbrella", "nessie"),
  structural("i_nessie_toy_crane", "Crane", "nessie"),

  // ── Famima group on island (parent: famima) ────────
  toy("i_famima_toy_pizza", "Pizza", "famima"),
  toy("i_famima_toy_ramen", "Ramen", "famima"),
  toy("i_famima_toy_flamingo", "Flamingo", "famima", {
    sound: "/sounds/american-flamingo-call.mp3",
  }),
  toy("i_famima_toy_vending_machine", "Vending Machine", "famima", {
    sound: "/sounds/vending_machine.mp3",
  }),

  // ── Pokemon Island group on island (parent: pokemon_island) ──
  toy("i_pokemon_island_toy_diglett", "Diglett", "pokemon_island", {
    sound: "/sounds/diglett.ogg",
    idle: "float",
  }),
  toy("i_pokemon_island_toy_staryu", "Staryu", "pokemon_island", {
    sound: "/sounds/staryu.ogg",
    idle: "float",
  }),
  toy("i_pokemon_island_toy_lapras", "Lapras", "pokemon_island", {
    sound: "/sounds/lapras.ogg",
    idle: "float",
  }),
  toy("i_pokemon_island_toy_pollywag", "Poliwag", "pokemon_island", {
    sound: "/sounds/poliwag.ogg",
    idle: "float",
  }),
  structural("i_pokemon_island_toy_bridge", "Bridge", "pokemon_island"),

  // ── Tower of Knowledge group on island (parent: tower_of_knowledge) ──
  toy("i_tower_of_knowledge_toy_crystal", "Crystal", "tower_of_knowledge", {
    sound: "/sounds/zc_tower_of_knowledge_CRYSTAL_PARENT.mp3",
  }),
  toy("i_tower_of_knowledge_toy_cat_dingus", "Dingus", "tower_of_knowledge", {
    sound: "/sounds/zc_tower_of_knowledge_character_cat_dingus.mp3",
    animation: "hop",
  }),
  toy("i_tower_of_knowledge_toy_cat_midge", "Midge", "tower_of_knowledge", {
    sound: "/sounds/zc_tower_of_knowledge_character_cat_midge.mp3",
    animation: "hop",
  }),
  toy("i_tower_of_knowledge_toy_cat_croissant", "Croissant", "tower_of_knowledge", {
    sound: "/sounds/zc_tower_of_knowledge_character_cat_croissant.mp3",
    animation: "hop",
  }),
  toy("i_tower_of_knowledge_toy_cat_benchcats", "Bench Cats", "tower_of_knowledge", {
    sound: "/sounds/zc_tower_of_knowledge_character_cat_benchcats.mp3",
    animation: "hop",
  }),
  toy("i_tower_of_knowledge_toy_blue_mushroom", "Blue Mushroom", "tower_of_knowledge", {
    animation: "grow",
  }),
  toy("i_tower_of_knowledge_toy_white_mushroom", "White Mushroom", "tower_of_knowledge", {
    animation: "grow",
  }),
  toy("i_tower_of_knowledge_toy_fish_on_cutting_board", "Fish on Cutting Board", "tower_of_knowledge"),
  toy("i_tower_of_knowledge_toy_save_point", "Save Point", "tower_of_knowledge"),
  structural("i_tower_of_knowledge_toy_castle_wall", "Castle Wall", "tower_of_knowledge"),
  structural("i_tower_of_knowledge_toy_stonewallpatch", "Stone Wall Patch", "tower_of_knowledge"),

  // Coming-soon crane zones (all deferred until Bug #9 crane fix)
  structural("i_crystals_toy_crane", "Crane", "crystals"),
  structural("i_flower_shop_toy_crane", "Crane", "flower_shop"),
  structural("i_mystery_zone_toy_crane", "Crane", "mystery_zone"),

  // ── Toys inside zone_beach_party.glb (parent: beach_party) ──
  structural("beach_party_toy_beach", "Beach", "beach_party"),
  toy("beach_party_toy_mudkip", "Mudkip", "beach_party", {
    sound: "/sounds/mudkip.ogg",
    animation: "hop",
  }),
  toy("beach_party_toy_squirtle", "Squirtle", "beach_party", {
    sound: "/sounds/squirtle.ogg",
    animation: "hop",
  }),
  toy("beach_party_toy_flamingo_01", "Flamingo", "beach_party", {
    sound: "/sounds/american-flamingo-call.mp3",
  }),
  toy("beach_party_toy_flamingo_02", "Flamingo", "beach_party", {
    sound: "/sounds/american-flamingo-call.mp3",
  }),
  toy("beach_party_toy_beach_ball", "Beach Ball", "beach_party"),
  toy("beach_party_toy_beach_chair", "Beach Chair", "beach_party"),
  toy("beach_party_toy_beach_towel_01", "Beach Towel", "beach_party"),
  toy("beach_party_toy_beach_towel_02", "Beach Towel", "beach_party"),
  toy("beach_party_toy_beach_umbrella", "Umbrella", "beach_party"),
  toy("beach_party_toy_cooler", "Cooler", "beach_party", {
    sound: "/sounds/zc_toy_beach_party_object_cooler.mp3",
  }),

  // ── Toys inside zone_bird_sanctuary.glb (parent: bird_sanctuary) ──
  toy("bird_sanctuary_toy_penguin", "Penguin", "bird_sanctuary", {
    sound: "/sounds/tobimasen.mp3",
    animation: "wobble",
  }),
  toy("bird_sanctuary_toy_ostrich", "Ostrich", "bird_sanctuary", {
    sound: "/sounds/common-ostrich-call.mp3",
    animation: "hop",
  }),
  toy("bird_sanctuary_toy_chocobo", "Chocobo", "bird_sanctuary", {
    sound: "/sounds/bs_toy_chocobo.mp3",
    animation: "hop",
  }),
  toy("bird_sanctuary_toy_kiwi_01", "Kiwi", "bird_sanctuary", {
    sound: "/sounds/okarito-brown-kiwi-call.mp3",
    animation: "hop",
  }),
  toy("bird_sanctuary_toy_kiwi_02", "Kiwi", "bird_sanctuary", {
    sound: "/sounds/okarito-brown-kiwi-call.mp3",
    animation: "hop",
  }),
  toy("bird_sanctuary_toy_flamingo", "Flamingo", "bird_sanctuary", {
    sound: "/sounds/american-flamingo-call.mp3",
    animation: "wobble",
  }),
  toy("bird_sanctuary_toy_puffin", "Puffin", "bird_sanctuary", {
    sound: "/sounds/atlantic-puffin-call.mp3",
    animation: "wobble",
  }),
  toy("bird_sanctuary_toy_baby_deku", "Baby Deku", "bird_sanctuary"),
  toy("bird_sanctuary_toy_tree_stump", "Tree Stump", "bird_sanctuary"),

  // ── Toys inside zone_cloud_town.glb (parent: cloud_town) ──
  toy("cloud_town_toy_ladder", "Ladder", "cloud_town"),
  toy("cloud_town_toy_metal_gear_rex", "Metal Gear Rex", "cloud_town"),
  toy("cloud_town_toy_keyboard", "Keyboard", "cloud_town"),

  // ── Toys inside zone_ss_brainfog.glb (parent: ss_brainfog) ──
  toy("ss_brainfog_toy_shark", "Shark", "ss_brainfog"),
  toy("ss_brainfog_toy_ss_aqua", "S.S. Aqua", "ss_brainfog"),

  // ── Toys inside zone_reading_room.glb (parent: reading_room) ──
  toy("reading_room_toy_TV", "TV", "reading_room"),
  toy("reading_room_toy_bed", "Bed", "reading_room"),
  toy("reading_room_toy_nes", "NES", "reading_room"),

  // ── Toys inside zone_pokemon_island.glb (parent: pokemon_island) ──
  toy("pokemon_island_toy_ekans", "Ekans", "pokemon_island", { sound: cry(23) }),
  toy("pokemon_island_toy_espeon", "Espeon", "pokemon_island", { sound: cry(196) }),
  toy("pokemon_island_toy_glaceon", "Glaceon", "pokemon_island", { sound: cry(471) }),
  toy("pokemon_island_toy_goldeen", "Goldeen", "pokemon_island", {
    sound: cry(118),
    idle: "float",
  }),
  toy("pokemon_island_toy_haunter", "Haunter", "pokemon_island", { sound: cry(93) }),
  toy("pokemon_island_toy_ho_oh", "Ho-Oh", "pokemon_island", { sound: cry(250) }),
  toy("pokemon_island_toy_horsea", "Horsea", "pokemon_island", {
    sound: cry(116),
    idle: "float",
  }),
  toy("pokemon_island_toy_krabby", "Krabby", "pokemon_island", { sound: cry(98) }),
  toy("pokemon_island_toy_lapras", "Lapras", "pokemon_island", {
    sound: "/sounds/lapras.ogg",
    idle: "float",
  }),
  toy("pokemon_island_toy_map", "Map", "pokemon_island"),
  toy("pokemon_island_toy_metapod", "Metapod", "pokemon_island", { sound: cry(11) }),
  toy("pokemon_island_toy_mew", "Mew", "pokemon_island", { sound: cry(151) }),
  toy("pokemon_island_toy_nidoking", "Nidoking", "pokemon_island", { sound: cry(34) }),
  toy("pokemon_island_toy_nidoqueen", "Nidoqueen", "pokemon_island", { sound: cry(31) }),
  toy("pokemon_island_toy_ninetails", "Ninetales", "pokemon_island", { sound: cry(38) }),
  toy("pokemon_island_toy_oddish_01", "Oddish", "pokemon_island", { sound: cry(43) }),
  toy("pokemon_island_toy_oddish_02", "Oddish", "pokemon_island", { sound: cry(43) }),
  toy("pokemon_island_toy_omanyte", "Omanyte", "pokemon_island", {
    sound: cry(138),
    idle: "float",
  }),
  toy("pokemon_island_toy_psyduck", "Psyduck", "pokemon_island", { sound: cry(54) }),
  toy("pokemon_island_toy_rapidash", "Rapidash", "pokemon_island", { sound: cry(78) }),
  toy("pokemon_island_toy_squirtle_01", "Squirtle", "pokemon_island", {
    sound: "/sounds/squirtle.ogg",
  }),
  toy("pokemon_island_toy_squirtle_02", "Squirtle", "pokemon_island", {
    sound: "/sounds/squirtle.ogg",
  }),
  toy("pokemon_island_toy_staryu_01", "Staryu", "pokemon_island", {
    sound: "/sounds/staryu.ogg",
    idle: "float",
  }),
  toy("pokemon_island_toy_staryu_02", "Staryu", "pokemon_island", {
    sound: "/sounds/staryu.ogg",
    idle: "float",
  }),
  toy("pokemon_island_toy_staryu_03", "Staryu", "pokemon_island", {
    sound: "/sounds/staryu.ogg",
    idle: "float",
  }),
  toy("pokemon_island_toy_staryu_04", "Staryu", "pokemon_island", {
    sound: "/sounds/staryu.ogg",
    idle: "float",
  }),
  toy("pokemon_island_toy_umbreon", "Umbreon", "pokemon_island", { sound: cry(197) }),

  // ── Sister sites (for QuickNav / site map) ─────────
  site("site_adhdo", "ADHDO", "/adhdo/"),
  site("site_bird_bingo", "Bird Bingo", "/bird-bingo/"),
  site("site_japanese_articles", "Japanese Articles", "/japanese-articles/"),
  site("site_nikbeat", "NikBeat", "/nikbeat/"),
  site("site_pokemon_park", "Pokemon Park", "/pokemon-park/"),
  site("site_weather_report", "Weather Report", "/weather-report/"),
  site("site_famima", "Famima", "/famima/"),
  site("site_jr_jingle_journey", "JR Jingle Journey", "/jr-jingle-journey/"),
  site("site_karasu_drop", "Karasu Drop", "/karasu-drop/"),
];

// ─── Indexed lookups ────────────────────────────────────────────────

export const sceneMap = new Map<string, SceneNode>(
  nodes.map((n) => [n.key.toLowerCase(), n]),
);

export function getNode(key: string): SceneNode | undefined {
  return sceneMap.get(key.toLowerCase());
}

export function getAncestry(key: string): SceneNode[] {
  const chain: SceneNode[] = [];
  let current = sceneMap.get(key);
  while (current) {
    chain.push(current);
    current = current.parent ? sceneMap.get(current.parent) : undefined;
  }
  return chain;
}

export function getBreadcrumbs(key: string): SceneNode[] {
  return getAncestry(key).reverse();
}

export function getActiveZones(): SceneNode[] {
  return nodes.filter((n) => n.type === "zone" && n.path && n.glbPath);
}

export function getIslandZones(): SceneNode[] {
  const island = sceneMap.get("island");
  if (!island) return [];
  return island.children
    .map((k) => sceneMap.get(k))
    .filter((n): n is SceneNode => !!n && n.type === "zone");
}

export function getSisterSites(): SceneNode[] {
  return nodes.filter((n) => n.type === "site");
}

export function getPortals(): SceneNode[] {
  return nodes.filter((n) => n.type === "portal");
}

/**
 * Lookup a node by GLB object name.
 * Handles both full keys (for toys) and stripped keys (for zones/portals).
 */
export function findNodeByObjectName(objName: string): SceneNode | undefined {
  const lower = objName.toLowerCase();

  // Direct match first (exact toy names + any full-name keyed nodes)
  if (sceneMap.has(lower)) return sceneMap.get(lower);

  // Strip zone_/portal_ prefix and try
  const stripped = lower.replace(/^(zone_|portal_)/, "");
  if (sceneMap.has(stripped)) return sceneMap.get(stripped);

  // Handle numbered duplicates (e.g. "zone_the_tunnels_01" → "the_tunnels")
  const withoutNum = stripped.replace(/_\d+$/, "");
  if (withoutNum !== stripped && sceneMap.has(withoutNum))
    return sceneMap.get(withoutNum);

  return undefined;
}

/**
 * For IslandScene / ZoneScene: zone_ / portal_ object → display + nav config.
 */
export function getZoneConfig(objName: string): {
  label: string;
  url: string | null;
  internal: boolean;
  type: "active" | "coming-soon";
  sounds?: string[];
} {
  const node = findNodeByObjectName(objName);
  if (node && node.type === "zone") {
    const isActive = !!(node.path && node.glbPath);
    return {
      label: node.label,
      url: node.path,
      internal: true,
      type: isActive ? "active" : "coming-soon",
      sounds: node.sounds,
    };
  }
  if (node && node.type === "portal") {
    return {
      label: node.label,
      url: node.url,
      internal: false,
      type: "active",
    };
  }
  const key = objName.replace(/^(zone_|portal_)/i, "").toLowerCase();
  return {
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    url: null,
    internal: false,
    type: "coming-soon",
  };
}

/**
 * For ZoneScene portal hotspot resolution.
 * Accepts either the stripped key ("bird_bingo") or the full object name ("portal_bird_bingo").
 */
export function getPortalConfig(
  key: string,
): { label: string; url: string } | undefined {
  const stripped = key.toLowerCase().replace(/^portal_/, "");
  const node = sceneMap.get(stripped);
  if (node && node.type === "portal" && node.url) {
    return { label: node.label, url: node.url };
  }
  return undefined;
}

/**
 * For ToyInteractor: get full toy config by object name.
 * Returns undefined if the object has no sceneMap entry.
 */
export function getToyConfig(objName: string):
  | {
      label: string;
      sound: string | null;
      animation: ToyAnimation;
      idle: ToyIdle;
      parent: string | null;
      interactive: boolean;
      quiet: boolean;
    }
  | undefined {
  const node = sceneMap.get(objName.toLowerCase());
  if (!node || node.type !== "toy") return undefined;
  return {
    label: node.label,
    sound: node.sound ?? null,
    animation: node.animation ?? "spin",
    idle: node.idle ?? "none",
    parent: node.parent,
    interactive: node.interactive !== false,
    quiet: node.quiet === true,
  };
}

/**
 * Returns true if the given object name is a toy that belongs to the given zone/portal.
 * Used by IslandScene + ZoneScene to gather outline-group members.
 */
export function isToyMemberOf(objName: string, parentKey: string): boolean {
  const node = sceneMap.get(objName.toLowerCase());
  return !!(node && node.type === "toy" && node.parent === parentKey);
}
