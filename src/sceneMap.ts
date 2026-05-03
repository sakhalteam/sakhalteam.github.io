// sceneMap.ts

import type { AtmosphereSubsystem, Weather } from "./environment/presets";

/**
 * sceneMap.ts — single source of truth for the entire site navigation tree.
 *
 * Naming model (see notes/rename-plan.md for the migration story):
 *   zone_<key>                    zone doorway (loads a scene)
 *   portal_<key>                  external portal (loads a URL)
 *   i_toy_<name>                  standalone island toy
 *   i_<zoneAbbr>_toy_<name>       island toy grouped with a zone/portal
 *   <zoneAbbr>_toy_<name>         toy inside a zone's own GLB
 *   <zone_name>_hitbox            optional click collider (overrides bbox)
 *
 * Zone abbreviations (used only in toy prefixes — sceneMap keys for zones
 * themselves stay spelled out). See CLAUDE.md for the full table.
 *   i, bs, ssb, ct, sz, tok, rr, dojo, pi, tun, bp, mz, ns, flwr, ware,
 *   crys, epi, meso, bathy, abyss, hadal, drmz, pool, famima
 *
 * Keys stored here:
 *   zones/portals are keyed by their STRIPPED name (no "zone_"/"portal_" prefix).
 *   Toys are keyed by their FULL object name.
 *   parent references use stripped keys for zones/portals.
 *
 * ─── Per-node options cheat sheet ───────────────────────────────────────
 * (Open this when you forget what's available. Defined on SceneNode below;
 *  what each helper accepts may differ — the helpers' opts type is the
 *  authoritative list.)
 *
 *   zone(key, label, opts):
 *     path           string | null       URL route; auto-derived if omitted
 *     glbPath        string | null       GLB asset path; auto-derived
 *     env            string              drei Environment HDRI preset
 *     atmosphere     AtmosphereConfig    sky/sun/clouds/etc. subsystems
 *     parent         string              sceneMap parent key
 *     children       string[]            sub-zones (for QuickNav tree only)
 *     sounds         string[]            click sounds (cycles)
 *     turntable      boolean             auto-rotate camera; default true
 *     camera         { padding, elevation, azimuth, min/maxZoomMultiplier }
 *     idle           IdleConfig          always-on motion (see below)
 *     idleOffset     number              optional 0..1 cycle phase offset
 *     labelOffsetY   number              extra world-units to lift hover label
 *     fullBleed      boolean             canvas edge-to-edge; UI floats
 *     focusDistance  number              click-to-focus override (world-units)
 *     focusBehavior  "fit" | "instant"   "instant" = no tween, fire immediately
 *     raycast        "default" | "bvh"    opt into animated/deformed geometry picking on island
 *
 *   portal(key, label, url, parent, opts):
 *     idle, idleOffset, labelOffsetY, focusDistance, focusBehavior, raycast  (subset of above)
 *
 *   toy(key, label, parent, opts):
 *     sounds, animation, idle, idleOffset, focusDistance, focusBehavior
 *     raycast        "default" | "bvh"    opt into deformed-geometry BVH picking
 *     interactive    boolean             clickable? default true
 *     showLabel      boolean             proximity label on hover; default true
 *     showOutline    boolean             toy-level outline on hover; default true
 *     labelOffsetY   number              extra world-units to lift hover label
 *
 *   site(key, label, url): no opts — used only for QuickNav listings.
 *
 * ─── Animation systems (two separate things, don't conflate) ───────────
 *
 *   idle:       always-on, code-generated motion (math, no GLB needed).
 *               Values: "undulate" | "float" | "spin" | "none"
 *               Or { kind, amplitude?, period?, axis? } to tune.
 *               Driven by IdleAnimator.tsx.
 *
 *   animation:  click-triggered behaviour. Values:
 *                 "spin"|"hop"|"grow"|"wobble"|"bob"|"none"  — code presets
 *                 "action"  — play Blender-authored clips from the GLB.
 *                             Clips matching /idle/ in their name auto-loop;
 *                             everything else cycles through on click.
 *               Driven by ToyInteractor.tsx.
 *
 *   The two fields share some value names (e.g. `idle: "undulate"` is
 *   geometrically similar to `animation: "bob"`) but they're different
 *   code paths and never interfere. Set both on the same toy if you want
 *   gentle always-on motion plus a clicker reaction.
 */

export type NodeType = "zone" | "portal" | "toy" | "site";

/**
 * Per-zone atmosphere config. Absent → zone uses the legacy hardcoded lights
 * (no sky / clouds / weather). Present → mounts the chosen subsystems with
 * the given defaults, optionally exposing user-facing controls.
 */
export interface AtmosphereConfig {
  /** Subsystems to mount (sky, sun, ambient, clouds, stars, fog, ...). */
  enabled: AtmosphereSubsystem[];
  /** Initial values (panel can change these at runtime if controls = true). */
  defaults?: {
    /** 0..23. Defaults to 12 (noon). */
    hour?: number;
    /** 0..59. Defaults to 0. */
    minute?: number;
    weather?: Weather;
    /** Game-minutes per real-second. 0 = frozen (default). Try ~60 for a visible sun arc. */
    timescale?: number;
  };
  /** Show the ⚙ settings panel? Default false. */
  controls?: boolean;
}

export type ToyAnimation =
  | "spin"
  | "hop"
  | "wobble"
  | "grow"
  | "bob"
  | "none"
  | "action";

/**
 * Idle animations — always-on, driven by IdleAnimator. Applied to the object's
 * root transform, so Blender-parented children (e.g. ct_toy_metal_gear_rex
 * under portal_weather_report) ride along without extra wiring.
 *
 *   "undulate" — gentle y-sine (zones/portals default)
 *   "float"    — subtle y-sine (water pokemon default)
 *   "spin"     — slow continuous rotation around chosen axis
 *   "none"     — disabled
 *
 * Pass a bare string for defaults, or an object to override amplitude /
 * period / axis per-node.
 *
 * NOTE: deliberately distinct from `animation` (click-triggered). The two
 * fields share some value names by accident of vocabulary (e.g. `bob` was
 * also a click-anim) so `idle` was renamed `bob → undulate` in 2026-04 to
 * make the mental model crisper. They use different code paths and never
 * interfere; you can set both on the same toy.
 */
export type IdleKind = "undulate" | "float" | "spin" | "none";
export type IdleConfig =
  | IdleKind
  | {
      kind: IdleKind;
      amplitude?: number;
      period?: number;
      axis?: "x" | "y" | "z";
    };

/**
 * Flight config — make a toy fly along a shared path defined by Blender
 * empties named `<group>_flight_start_NN` / `<group>_flight_finish_NN`.
 *
 *   group:    prefix of the path empties. Multiple toys can share the same
 *             group (e.g. all four Star Fox arwings on group "arwing").
 *   phase:    0..1 offset into the cycle on mount. Stagger several toys on
 *             the same group with different phases so they don't stack.
 *   duration: seconds per cycle. Defaults to 18.
 *   rollTriggerRadius: world distance at which a `*_barrel_roll_trigger`
 *             empty fires a barrel roll. Defaults to 4.
 */
export interface FlightConfig {
  group: string;
  phase?: number;
  duration?: number;
  rollTriggerRadius?: number;
}

export interface SceneNode {
  key: string;
  label: string;
  type: NodeType;
  path: string | null;
  url: string | null;
  glbPath: string | null;
  environmentPreset?: string;
  atmosphere?: AtmosphereConfig;
  parent: string | null;
  children: string[];
  sounds?: string[];
  animation?: ToyAnimation;
  idle?: IdleConfig;
  /** Optional cycle offset for IdleAnimator. 0.25 = start a quarter-cycle later. */
  idleOffset?: number;
  flight?: FlightConfig;
  /** If false, toy is not clickable and has no animation/sound — pure outline-group member. */
  interactive?: boolean;
  /** Whether to show a proximity label on hover. Default true. When false, the toy gets a subtle emissive tint on hover instead. */
  showLabel?: boolean;
  /** Whether to emit a toy-level outline on hover. Default true. */
  showOutline?: boolean;
  /** Zones/portals: extra world-units to lift the hover label above the default (bbox-top + small pad). Use when a toy parented to the portal makes the default label clip. */
  labelOffsetY?: number;
  /** Zones: render the 3D canvas edge-to-edge under floating overlays (header/footer/panels become absolutely-positioned over the scene). Default false. */
  fullBleed?: boolean;
  /** Override the camera viewing distance after a click-to-focus, in world
   *  units. Bypasses the bbox-derived `radius * distanceMultiplier` default. */
  focusDistance?: number;
  /** How a click on this node interacts with the focus camera.
   *   "fit" (default): tween to a fitted framing on first click, fire the
   *     action on the second click.
   *   "instant": skip the focus tween entirely — the click fires the action
   *     immediately. Use for moving targets (e.g. flight zones) where
   *     chasing the focus point makes the object fly off-screen anyway. */
  focusBehavior?: "fit" | "instant";
  /** Raycast mode. Toys use this everywhere; zones/portals currently use it on the main island. */
  raycast?: "default" | "bvh";
  /** Zones: auto-turntable rotation. Default true. Set false to keep the camera still. */
  turntable?: boolean;
  /** Zones: optional camera override for useAutoFitCamera. */
  camera?: {
    padding?: number;
    elevation?: number;
    azimuth?: number;
    minZoomMultiplier?: number;
    maxZoomMultiplier?: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function zone(
  key: string,
  label: string,
  opts: {
    path?: string | null;
    glbPath?: string | null;
    env?: string;
    atmosphere?: AtmosphereConfig;
    parent?: string;
    children?: string[];
    sounds?: string[];
    turntable?: boolean;
    camera?: SceneNode["camera"];
    idle?: IdleConfig;
    idleOffset?: number;
    labelOffsetY?: number;
    fullBleed?: boolean;
    focusDistance?: number;
    focusBehavior?: "fit" | "instant";
    raycast?: SceneNode["raycast"];
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
    parent: opts.parent ?? "island",
    children: opts.children ?? [],
    ...(opts.env !== undefined && { environmentPreset: opts.env }),
    ...(opts.atmosphere && { atmosphere: opts.atmosphere }),
    ...(opts.sounds && { sounds: opts.sounds }),
    ...(opts.turntable === false && { turntable: false }),
    ...(opts.camera && { camera: opts.camera }),
    ...(opts.idle !== undefined && { idle: opts.idle }),
    ...(opts.idleOffset !== undefined && { idleOffset: opts.idleOffset }),
    ...(opts.labelOffsetY !== undefined && { labelOffsetY: opts.labelOffsetY }),
    ...(opts.fullBleed !== undefined && { fullBleed: opts.fullBleed }),
    ...(opts.focusDistance !== undefined && {
      focusDistance: opts.focusDistance,
    }),
    ...(opts.focusBehavior !== undefined && {
      focusBehavior: opts.focusBehavior,
    }),
    ...(opts.raycast !== undefined && { raycast: opts.raycast }),
  };
}

function portal(
  key: string,
  label: string,
  url: string,
  parent: string,
  opts: {
    idle?: IdleConfig;
    idleOffset?: number;
    labelOffsetY?: number;
    focusDistance?: number;
    focusBehavior?: "fit" | "instant";
    raycast?: SceneNode["raycast"];
  } = {},
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
    ...(opts.idle !== undefined && { idle: opts.idle }),
    ...(opts.idleOffset !== undefined && { idleOffset: opts.idleOffset }),
    ...(opts.labelOffsetY !== undefined && { labelOffsetY: opts.labelOffsetY }),
    ...(opts.focusDistance !== undefined && {
      focusDistance: opts.focusDistance,
    }),
    ...(opts.focusBehavior !== undefined && {
      focusBehavior: opts.focusBehavior,
    }),
    ...(opts.raycast !== undefined && { raycast: opts.raycast }),
  };
}

function toy(
  key: string,
  label: string,
  parent: string,
  opts: {
    sounds?: string[];
    animation?: ToyAnimation;
    idle?: IdleConfig;
    idleOffset?: number;
    flight?: FlightConfig;
    interactive?: boolean;
    showLabel?: boolean;
    showOutline?: boolean;
    labelOffsetY?: number;
    focusDistance?: number;
    focusBehavior?: "fit" | "instant";
    raycast?: SceneNode["raycast"];
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
    ...(opts.sounds && { sounds: opts.sounds }),
    ...(opts.animation && { animation: opts.animation }),
    ...(opts.idle && { idle: opts.idle }),
    ...(opts.idleOffset !== undefined && { idleOffset: opts.idleOffset }),
    ...(opts.flight && { flight: opts.flight }),
    ...(opts.interactive === false && { interactive: false }),
    ...(opts.showLabel === false && { showLabel: false }),
    ...(opts.showOutline === false && { showOutline: false }),
    ...(opts.labelOffsetY !== undefined && { labelOffsetY: opts.labelOffsetY }),
    ...(opts.focusDistance !== undefined && {
      focusDistance: opts.focusDistance,
    }),
    ...(opts.focusBehavior !== undefined && {
      focusBehavior: opts.focusBehavior,
    }),
    ...(opts.raycast !== undefined && { raycast: opts.raycast }),
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

/** Shortcut for structural/decorative members — non-interactive, no label, no own outline. Still in parent's outline group. */
const structural = (key: string, label: string, parent: string): SceneNode =>
  toy(key, label, parent, {
    interactive: false,
    showLabel: false,
    showOutline: false,
  });

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
    fullBleed: true,
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
  // This is where you add idle animations to zones ON island.glb scene
  zone("bird_sanctuary", "Bird Sanctuary", {
    env: "forest",
    children: [
      "portal_bird_bingo",
      "bs_toy_chocobo",
      "bs_toy_flamingo",
      "bs_toy_kiwi_01",
      "bs_toy_kiwi_02",
      "bs_toy_ostrich",
      "bs_toy_penguin",
      "bs_toy_puffin",
      "bs_toy_baby_deku",
      "bs_toy_tree_stump",
    ],
  }),
  zone("ss_brainfog", "S.S. Brainfog", {
    turntable: true,
    children: [
      "portal_adhdo",
      "portal_karasu_drop",
      "ssb_toy_shark",
      "ssb_toy_ss_aqua",
    ],
  }),
  zone("cloud_town", "Cloud Town", {
    env: "city",
    turntable: true,
    fullBleed: true,
    camera: { padding: 1, elevation: 0.45, azimuth: 0.3 },
    idle: { kind: "undulate", amplitude: 0.07, period: 4 },
    raycast: "bvh",
    atmosphere: {
      enabled: [
        "sky",
        "sun",
        "ambient",
        "clouds",
        "sky_clouds",
        "celestials",
        "stars",
        "fog",
      ],
      defaults: { hour: 4, minute: 27, weather: "clear", timescale: 0 },
      controls: true,
    },
    children: [
      "portal_weather_report",
      "ct_toy_metal_gear_rex",
      "ct_toy_keyboard",
      "ct_toy_cloud_01",
      "ct_toy_cloud_02",
      "ct_toy_cloud_03",
      "ct_toy_cloud_04",
      "ct_toy_cloud_05",
      "ct_toy_ladder",
      "ct_toy_weather_report",
      "ct_toy_fox_arwing",
      "ct_toy_falco_arwing",
      "ct_toy_peppy_arwing",
      "ct_toy_slippy_arwing",
      "ct_toy_jotaro_hat",
      "dream_zone",
      "pool_time",
      "starlight_zone",
    ],
  }),
  zone("starlight_zone", "Starlight Zone", {
    glbPath: null,
    path: null,
    parent: "cloud_town",
  }),
  zone("tower_of_knowledge", "Tower Of Knowledge", {
    children: ["reading_room", "dojo"],
  }),
  zone("reading_room", "Reading Room", {
    parent: "tower_of_knowledge",
    children: [
      "portal_japanese_articles",
      "portal_proto_typing",
      "rr_toy_TV",
      "rr_toy_bed",
      "rr_toy_nes",
    ],
  }),
  zone("dojo", "Dojo", {
    parent: "tower_of_knowledge",
  }),
  zone("pokemon_island", "Pokemon Island", {
    children: [
      "portal_pokemon_park",
      "pi_toy_ekans",
      "pi_toy_espeon",
      "pi_toy_glaceon",
      "pi_toy_goldeen",
      "pi_toy_haunter",
      "pi_toy_ho_oh",
      "pi_toy_horsea",
      "pi_toy_krabby",
      "pi_toy_lapras",
      "pi_map",
      "pi_toy_metapod",
      "pi_toy_mew",
      "pi_toy_nidoking",
      "pi_toy_nidoqueen",
      "pi_toy_ninetails",
      "pi_toy_oddish_01",
      "pi_toy_oddish_02",
      "pi_toy_omanyte",
      "pi_toy_psyduck",
      "pi_toy_rapidash",
      "pi_toy_squirtle_01",
      "pi_toy_squirtle_02",
      "pi_toy_staryu_01",
      "pi_toy_staryu_02",
      "pi_toy_staryu_03",
      "pi_toy_staryu_04",
      "pi_toy_umbreon",
    ],
  }),
  zone("the_tunnels", "The Tunnels", {
    children: ["portal_jr_jingle_journey"],
  }),
  zone("beach_party", "Beach Party", {
    env: "sunset",
    children: [
      "portal_nikbeat",
      "bp_toy_beach",
      "bp_toy_mudkip",
      "bp_toy_squirtle",
      "bp_toy_flamingo_01",
      "bp_toy_flamingo_02",
      "bp_toy_beach_ball",
      "bp_toy_beach_chair",
      "bp_toy_beach_towel_01",
      "bp_toy_beach_towel_02",
      "bp_toy_beach_umbrella",
      "bp_toy_cooler",
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
    children: ["i_ns_toy_hat", "i_ns_toy_umbrella", "i_ns_toy_crane"],
  }),
  zone("flower_shop", "Flower Shop", {
    glbPath: null,
    path: null,
    children: ["i_flwr_toy_crane"],
  }),
  zone("warehouse", "Warehouse", {
    glbPath: null,
    path: null,
    sounds: ["/sounds/zone_warehouse.mp3"],
  }),
  zone("the_epipelagic", "The Epipelagic", {
    glbPath: null,
    path: null,
  }),
  zone("the_mesopelagic", "The Mesopelagic", {
    glbPath: null,
    path: null,
  }),
  zone("the_bathypelagic", "The Bathypelagic", {
    glbPath: null,
    path: null,
  }),
  zone("the_abyssalpelagic", "The Abyssalpelagic", {
    glbPath: null,
    path: null,
  }),
  zone("the_hadalpelagic", "The Hadalpelagic", {
    glbPath: null,
    path: null,
  }),
  zone("crystals", "Crystals", {
    glbPath: null,
    path: null,
    sounds: ["/sounds/zone_crystals.mp3"],
    children: ["i_crys_toy_crane"],
  }),
  // Inside Cloud Town scene (no GLB yet):
  zone("dream_zone", "Dream Zone", {
    glbPath: null,
    path: null,
    parent: "cloud_town",
    idle: { kind: "undulate", amplitude: 0.15, period: 5 }, // ← override here
  }),
  zone("pool_time", "Pool Time", {
    glbPath: null,
    path: null,
    parent: "cloud_town",
    idle: "undulate",
    labelOffsetY: 2,
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
  portal(
    "japanese_articles",
    "Japanese Articles",
    "/japanese-articles/",
    "reading_room",
  ),
  portal("proto_typing", "Proto-Typing", "/proto-typing/", "reading_room"),
  portal("nikbeat", "NikBeat", "/nikbeat/", "beach_party"),
  portal("pokemon_park", "Pokemon Park", "/pokemon-park/", "pokemon_island"),
  portal("weather_report", "Weather Report", "/weather-report/", "cloud_town", {
    idle: "undulate",
    labelOffsetY: 5,
    raycast: "bvh",
  }),
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
    sounds: ["/sounds/rock-pigeon-call.mp3"],
    animation: "hop",
  }),
  toy("i_toy_pigeon_02", "Pigeon", "island", {
    sounds: ["/sounds/rock-pigeon-call.mp3"],
    animation: "hop",
  }),
  toy("i_toy_dinosaur_statue", "Dinosaur", "island", {
    sounds: ["/sounds/i_toy_dinosaur_statue.mp3"],
    animation: "none",
  }),
  toy("i_toy_harpy", "Harpy", "island", { animation: "action" }),
  toy("i_toy_egg_green", "Green Egg", "island", { animation: "hop" }),
  toy("i_toy_egg_pink", "Pink Egg", "island", { animation: "hop" }),
  toy("i_toy_vending_machine_01", "Vending Machine", "island", {
    sounds: ["/sounds/vending_machine.mp3"],
  }),
  toy("i_toy_vending_machine_02", "Vending Machine", "island", {
    sounds: ["/sounds/vending_machine.mp3"],
  }),
  toy("i_toy_lion_statue_left", "Lion Statue", "island"),
  toy("i_toy_lion_statue_right", "Lion Statue", "island"),

  // ── Beach Party group (parent: beach_party) ────────
  toy("i_bp_toy_mudkip", "Mudkip", "beach_party", {
    sounds: ["/sounds/mudkip.ogg"],
    animation: "hop",
  }),
  toy("i_bp_toy_squirtle", "Squirtle", "beach_party", {
    sounds: ["/sounds/squirtle.ogg"],
    animation: "hop",
  }),
  toy("i_bp_toy_beach_ball", "Beach Ball", "beach_party"),
  toy("i_bp_toy_beach_chair", "Beach Chair", "beach_party"),
  toy("i_bp_toy_cooler", "Cooler", "beach_party", {
    sounds: ["/sounds/i_bp_toy_cooler.mp3"],
  }),
  toy("i_bp_toy_umbrella", "Umbrella", "beach_party"),
  toy("i_bp_toy_beach_towel_01", "Beach Towel", "beach_party"),
  toy("i_bp_toy_beach_towel_02", "Beach Towel", "beach_party"),
  toy("i_bp_toy_flamingo_01", "Flamingo", "beach_party", {
    sounds: ["/sounds/american-flamingo-call.mp3"],
    animation: "wobble",
  }),
  toy("i_bp_toy_flamingo_02", "Flamingo", "beach_party", {
    sounds: ["/sounds/american-flamingo-call.mp3"],
    animation: "wobble",
  }),

  // ── Bird Sanctuary group on island (parent: bird_sanctuary) ──
  toy("i_bs_toy_cassowary", "Cassowary", "bird_sanctuary", {
    sounds: ["/sounds/southern-cassowary-call.mp3"],
    animation: "wobble",
    showLabel: false,
  }),
  toy("i_bs_toy_eagle", "Eagle", "bird_sanctuary", {
    sounds: ["/sounds/red-tailed-hawk-call.mp3"],
    animation: "bob",
  }),
  toy("i_bs_toy_american_robin", "American Robin", "bird_sanctuary", {
    sounds: ["/sounds/american-robin-call.mp3"],
    animation: "hop",
  }),
  toy("i_bs_toy_baltimore_oriole", "Baltimore Oriole", "bird_sanctuary", {
    sounds: ["/sounds/baltimore-oriole-call.mp3"],
    animation: "hop",
  }),
  toy("i_bs_toy_blue_jay", "Blue Jay", "bird_sanctuary", {
    sounds: ["/sounds/blue-jay-call.mp3"],
    animation: "hop",
  }),
  toy("i_bs_toy_northern_cardinal", "Northern Cardinal", "bird_sanctuary", {
    sounds: ["/sounds/northern-cardinal-call.mp3"],
    animation: "hop",
  }),
  toy("i_bs_toy_king_egg", "King Egg", "bird_sanctuary", {
    animation: "hop",
  }),

  // ── Nessie group on island (parent: nessie) ────────
  toy("i_ns_toy_hat", "Hat", "nessie"),
  toy("i_ns_toy_umbrella", "Umbrella", "nessie"),
  structural("i_ns_toy_crane", "Crane", "nessie"),

  // ── Famima group on island (parent: famima) ────────
  toy("i_famima_toy_pizza", "Pizza", "famima"),
  toy("i_famima_toy_ramen", "Ramen", "famima", {
    sounds: ["/sounds/ramen.mp3"],
    animation: "hop",
  }),
  toy("i_famima_toy_flamingo", "Flamingo", "famima", {
    sounds: ["/sounds/american-flamingo-call.mp3"],
  }),
  toy("i_famima_toy_vending_machine", "Vending Machine", "famima", {
    sounds: ["/sounds/vending_machine.mp3"],
  }),

  // ── Pokemon Island group on island (parent: pokemon_island) ──
  toy("i_pi_toy_diglett", "Diglett", "pokemon_island", {
    sounds: ["/sounds/diglett.ogg"],
    animation: "hop",
  }),
  toy("i_pi_toy_staryu", "Staryu", "pokemon_island", {
    sounds: ["/sounds/staryu.ogg"],
    idle: "float",
  }),
  toy("i_pi_toy_lapras", "Lapras", "pokemon_island", {
    sounds: ["/sounds/lapras.ogg"],
    idle: "float",
    raycast: "bvh",
    animation: "bob",
  }),
  toy("i_pi_toy_poliwag", "Poliwag", "pokemon_island", {
    sounds: ["/sounds/poliwag.ogg"],
    animation: "hop",
  }),
  structural("i_pi_toy_bridge", "Bridge", "pokemon_island"),

  // ── Tower of Knowledge group on island (parent: tower_of_knowledge) ──
  toy("i_tok_toy_save_point", "Save Point", "tower_of_knowledge", {
    sounds: ["/sounds/i_tok_toy_save_crystal.mp3"],
  }),
  toy("i_tok_toy_cat_dingus", "Dingus", "tower_of_knowledge", {
    sounds: ["/sounds/i_tok_toy_character_cat_dingus.mp3"],
    animation: "hop",
  }),
  toy("i_tok_toy_cat_midge", "Midge", "tower_of_knowledge", {
    sounds: ["/sounds/i_tok_toy_character_cat_midge.mp3"],
    animation: "hop",
  }),
  toy("i_tok_toy_cat_croissant", "Croissant", "tower_of_knowledge", {
    sounds: ["/sounds/i_tok_toy_character_cat_croissant.mp3"],
    animation: "hop",
  }),
  toy("i_tok_toy_cat_benchcats", "Bench Cats", "tower_of_knowledge", {
    sounds: ["/sounds/i_tok_toy_character_cat_benchcats.mp3"],
    animation: "hop",
  }),
  toy("i_tok_toy_blue_mushroom", "Blue Mushroom", "tower_of_knowledge", {
    animation: "grow",
  }),
  toy("i_tok_toy_white_mushroom", "White Mushroom", "tower_of_knowledge", {
    animation: "grow",
  }),
  toy(
    "i_tok_toy_fish_on_cutting_board",
    "Fish on Cutting Board",
    "tower_of_knowledge",
  ),
  structural("i_tok_toy_castle_wall", "Castle Wall", "tower_of_knowledge"),
  structural(
    "i_tok_toy_stonewallpatch",
    "Stone Wall Patch",
    "tower_of_knowledge",
  ),

  // Coming-soon crane zones (all deferred until Bug #9 crane fix)
  structural("i_crys_toy_crane", "Crane", "crystals"),
  structural("i_flwr_toy_crane", "Crane", "flower_shop"),
  structural("i_mz_toy_crane", "Crane", "mystery_zone"),

  // ── Toys inside zone_beach_party.glb (parent: beach_party) ──
  structural("bp_toy_beach", "Beach", "beach_party"),
  toy("bp_toy_mudkip", "Mudkip", "beach_party", {
    sounds: ["/sounds/mudkip.ogg"],
    animation: "hop",
  }),
  toy("bp_toy_squirtle", "Squirtle", "beach_party", {
    sounds: ["/sounds/squirtle.ogg"],
    animation: "hop",
  }),
  toy("bp_toy_flamingo_01", "Flamingo", "beach_party", {
    sounds: ["/sounds/american-flamingo-call.mp3"],
  }),
  toy("bp_toy_flamingo_02", "Flamingo", "beach_party", {
    sounds: ["/sounds/american-flamingo-call.mp3"],
  }),
  toy("bp_toy_beach_ball", "Beach Ball", "beach_party"),
  toy("bp_toy_beach_chair", "Beach Chair", "beach_party"),
  toy("bp_toy_beach_towel_01", "Beach Towel", "beach_party"),
  toy("bp_toy_beach_towel_02", "Beach Towel", "beach_party"),
  toy("bp_toy_beach_umbrella", "Umbrella", "beach_party"),
  toy("bp_toy_cooler", "Cooler", "beach_party", {
    sounds: ["/sounds/i_bp_toy_cooler.mp3"],
  }),

  // ── Toys inside zone_bird_sanctuary.glb (parent: bird_sanctuary) ──
  toy("bs_toy_penguin", "Penguin", "bird_sanctuary", {
    sounds: ["/sounds/tobimasen.mp3"],
    animation: "hop",
  }),
  toy("bs_toy_ostrich", "Ostrich", "bird_sanctuary", {
    sounds: ["/sounds/common-ostrich-call.mp3"],
    animation: "hop",
  }),
  toy("bs_toy_chocobo", "Chocobo", "bird_sanctuary", {
    sounds: ["/sounds/bs_toy_chocobo.mp3"],
    animation: "hop",
  }),
  toy("bs_toy_kiwi_01", "Kiwi", "bird_sanctuary", {
    sounds: ["/sounds/okarito-brown-kiwi-call.mp3"],
    animation: "hop",
  }),
  toy("bs_toy_kiwi_02", "Kiwi", "bird_sanctuary", {
    sounds: ["/sounds/okarito-brown-kiwi-call.mp3"],
    animation: "hop",
  }),
  toy("bs_toy_flamingo", "Flamingo", "bird_sanctuary", {
    sounds: ["/sounds/american-flamingo-call.mp3"],
    animation: "bob",
  }),
  toy("bs_toy_puffin", "Puffin", "bird_sanctuary", {
    sounds: ["/sounds/atlantic-puffin-call.mp3"],
    animation: "hop",
  }),
  toy("bs_toy_baby_deku", "Baby Deku", "bird_sanctuary"),
  toy("bs_toy_tree_stump", "Tree Stump", "bird_sanctuary"),

  // ── Toys inside zone_cloud_town.glb (parent: cloud_town) ──
  toy("ct_toy_ladder", "ladder", "cloud_town", {
    animation: "none",
    showLabel: false,
    showOutline: true,
  }),
  toy("ct_toy_fox_arwing", "Fox's Arwing", "cloud_town", {
    sounds: [
      "/sounds/fox_snes.wav",
      "/sounds/fox_break_through_fleet.wav",
      "/sounds/fox_cant_leave_slippy.wav",
      "/sounds/fox_open_the_wings.wav",
      "/sounds/fox_all_range_mode.wav",
      "/sounds/fox_uh_oh_spotted.wav",
    ],
    animation: "none",
    flight: { group: "arwing", phase: 0, duration: 18, rollTriggerRadius: 10 },
    focusBehavior: "instant",
  }),
  toy("ct_toy_falco_arwing", "Falco's Arwing", "cloud_town", {
    sounds: [
      "/sounds/falco_snes.wav",
      "/sounds/falco_all_right.wav",
      "/sounds/falco_got_company.wav",
      "/sounds/falco_outta_my_way.wav",
      "/sounds/falco_jp_01.wav",
      "/sounds/falco_jp_02.wav",
    ],
    animation: "none",
    flight: {
      group: "arwing",
      phase: 0.25,
      duration: 18,
      rollTriggerRadius: 10,
    },
    focusBehavior: "instant",
  }),
  toy("ct_toy_peppy_arwing", "Peppy's Arwing", "cloud_town", {
    sounds: [
      "/sounds/peppy_snes.wav",
      "/sounds/peppy_jp_01.wav",
      "/sounds/peppy_jp_02.wav",
      "/sounds/peppy_en_01.wav",
      "/sounds/peppy_knock_it_off.wav",
      "/sounds/peppy_a-ok.wav",
      "/sounds/peppy_barrel_roll.wav",
    ],
    animation: "none",
    flight: {
      group: "arwing",
      phase: 0.5,
      duration: 18,
      rollTriggerRadius: 10,
    },
    focusBehavior: "instant",
  }),
  toy("ct_toy_slippy_arwing", "Slippy's Arwing", "cloud_town", {
    sounds: [
      "/sounds/slippy_snes.wav",
      "/sounds/slippy_yeah_yeah.wav",
      "/sounds/slippy_ahhhhh.wav",
      "/sounds/slippy_oh_no.wav",
      "/sounds/slippy_sheesh_you_too.wav",
      "/sounds/slippy_ships_shielded_too.wav",
      "/sounds/slippy_thanks_I_thought.wav",
      "/sounds/slippy_jp_01.wav",
      "/sounds/slippy_daijoubu.wav",
    ],
    animation: "none",
    flight: {
      group: "arwing",
      phase: 0.75,
      duration: 18,
      rollTriggerRadius: 10,
    },
    focusBehavior: "instant",
  }),
  toy("ct_toy_metal_gear_rex", "Metal Gear Rex", "cloud_town", {
    showLabel: false,
    sounds: [
      "/sounds/ct_toy_metal_gear_rex_01.wav",
      "/sounds/ct_toy_metal_gear_rex_02.wav",
    ],
    animation: "hop",
  }),
  toy("ct_toy_weather_report", "Weather Report JJBA", "cloud_town", {
    showLabel: false,
    sounds: [
      "/sounds/ct_toy_weather_report_01.wav",
      "/sounds/ct_toy_weather_report_02.wav",
      "/sounds/ct_toy_weather_report_03.wav",
      "/sounds/ct_toy_weather_report_04.wav",
    ],
    animation: "none",
    raycast: "bvh",
  }),
  toy("ct_toy_keyboard", "Keyboard", "cloud_town", {
    showLabel: false,
    showOutline: false,
  }),
  toy("ct_toy_cloud_01", "Cloud", "cloud_town", {
    showLabel: false,
    showOutline: false,
    idle: "undulate",
    idleOffset: 0.25,
  }),
  toy("ct_toy_cloud_02", "Cloud", "cloud_town", {
    showLabel: false,
    showOutline: false,
    idle: "undulate",
    idleOffset: 0.35,
  }),
  toy("ct_toy_cloud_03", "Cloud", "cloud_town", {
    showLabel: false,
    showOutline: false,
    idle: "undulate",
    idleOffset: 0.45,
  }),
  toy("ct_toy_cloud_04", "Cloud", "cloud_town", {
    showLabel: false,
    showOutline: false,
    idle: "undulate",
    idleOffset: 0.55,
  }),
  toy("ct_toy_cloud_05", "Cloud", "cloud_town", {
    showLabel: false,
    showOutline: false,
    idle: "undulate",
    idleOffset: 0.65,
  }),
  toy("ct_toy_jotaro_hat", "Jotaro's Hat", "cloud_town", {
    showLabel: false,
    showOutline: false,
    sounds: ["/sounds/ct_toy_jotaro_hat_01.wav"],
  }),

  // ── Toys inside zone_ss_brainfog.glb (parent: ss_brainfog) ──
  toy("ssb_toy_shark", "Shark", "ss_brainfog", {
    raycast: "bvh",
  }),
  toy("ssb_toy_ss_aqua", "S.S. Aqua", "ss_brainfog", {
    sounds: ["/sounds/ssb_toy_ss_aqua.mp3"],
    animation: "hop",
  }),

  // ── Toys inside zone_reading_room.glb (parent: reading_room) ──
  toy("rr_toy_TV", "TV", "reading_room"),
  toy("rr_toy_bed", "Bed", "reading_room"),
  toy("rr_toy_nes", "NES", "reading_room"),

  // ── Toys inside zone_pokemon_island.glb (parent: pokemon_island) ──
  toy("pi_toy_ekans", "Ekans", "pokemon_island", {
    sounds: [cry(23)],
    animation: "hop",
  }),
  toy("pi_toy_espeon", "Espeon", "pokemon_island", {
    sounds: [cry(196)],
    animation: "hop",
  }),
  toy("pi_toy_glaceon", "Glaceon", "pokemon_island", {
    sounds: [cry(471)],
    animation: "hop",
  }),
  toy("pi_toy_goldeen", "Goldeen", "pokemon_island", {
    sounds: [cry(118)],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_haunter", "Haunter", "pokemon_island", {
    sounds: [cry(93)],
    animation: "hop",
  }),
  toy("pi_toy_ho_oh", "Ho-Oh", "pokemon_island", {
    sounds: [cry(250)],
    animation: "hop",
  }),
  toy("pi_toy_horsea", "Horsea", "pokemon_island", {
    sounds: [cry(116)],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_krabby", "Krabby", "pokemon_island", {
    sounds: [cry(98)],
    animation: "hop",
  }),
  toy("pi_toy_lapras", "Lapras", "pokemon_island", {
    sounds: ["/sounds/lapras.ogg"],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_metapod", "Metapod", "pokemon_island", {
    sounds: [cry(11)],
    animation: "hop",
  }),
  toy("pi_toy_mew", "Mew", "pokemon_island", { sounds: [cry(151)] }),
  toy("pi_toy_nidoking", "Nidoking", "pokemon_island", {
    sounds: [cry(34)],
    animation: "hop",
  }),
  toy("pi_toy_nidoqueen", "Nidoqueen", "pokemon_island", {
    sounds: [cry(31)],
    animation: "hop",
  }),
  toy("pi_toy_ninetails", "Ninetales", "pokemon_island", {
    sounds: [cry(38)],
    animation: "hop",
  }),
  toy("pi_toy_oddish_01", "Oddish", "pokemon_island", {
    sounds: [cry(43)],
    animation: "hop",
  }),
  toy("pi_toy_oddish_02", "Oddish", "pokemon_island", {
    sounds: [cry(43)],
    animation: "hop",
  }),
  toy("pi_toy_omanyte", "Omanyte", "pokemon_island", {
    sounds: [cry(138)],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_psyduck", "Psyduck", "pokemon_island", {
    sounds: [cry(54)],
    animation: "hop",
  }),
  toy("pi_toy_rapidash", "Rapidash", "pokemon_island", {
    sounds: [cry(78)],
    animation: "hop",
  }),
  toy("pi_toy_squirtle_01", "Squirtle", "pokemon_island", {
    sounds: ["/sounds/squirtle.ogg"],
    animation: "hop",
  }),
  toy("pi_toy_squirtle_02", "Squirtle", "pokemon_island", {
    sounds: ["/sounds/squirtle.ogg"],
    animation: "hop",
  }),
  toy("pi_toy_staryu_01", "Staryu", "pokemon_island", {
    sounds: ["/sounds/staryu.ogg"],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_staryu_02", "Staryu", "pokemon_island", {
    sounds: ["/sounds/staryu.ogg"],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_staryu_03", "Staryu", "pokemon_island", {
    sounds: ["/sounds/staryu.ogg"],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_staryu_04", "Staryu", "pokemon_island", {
    sounds: ["/sounds/staryu.ogg"],
    idle: "float",
    animation: "hop",
  }),
  toy("pi_toy_umbreon", "Umbreon", "pokemon_island", {
    sounds: [cry(197)],
    animation: "hop",
  }),

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

/** All nodes (toys, zones, portals) with a `flight` config. */
export function getFlightNodes(): SceneNode[] {
  return nodes.filter((n) => !!n.flight);
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
      sounds: string[] | null;
      animation: ToyAnimation;
      parent: string | null;
      interactive: boolean;
      showLabel: boolean;
      showOutline: boolean;
      labelOffsetY: number;
      focusDistance?: number;
      focusBehavior?: "fit" | "instant";
      raycast: "default" | "bvh";
    }
  | undefined {
  const node = sceneMap.get(objName.toLowerCase());
  if (!node || node.type !== "toy") return undefined;
  return {
    label: node.label,
    sounds: node.sounds ?? null,
    animation: node.animation ?? "spin",
    parent: node.parent,
    interactive: node.interactive !== false,
    showLabel: node.showLabel !== false,
    showOutline: node.showOutline !== false,
    labelOffsetY: node.labelOffsetY ?? 0,
    focusDistance: node.focusDistance,
    focusBehavior: node.focusBehavior,
    raycast: node.raycast ?? "default",
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
