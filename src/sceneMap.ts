/**
 * sceneMap.ts — single source of truth for the entire site navigation tree.
 *
 * Every zone, portal, toy, and sister site is defined here. All other files
 * (App.tsx routes, IslandScene zone configs, ZoneScene portal configs,
 * BirdSanctuaryScene hotspots, QuickNav, future breadcrumbs) should derive
 * their data from this map instead of maintaining their own constants.
 */

export type NodeType = 'zone' | 'portal' | 'toy' | 'site'

export interface SceneNode {
  /** Unique key — matches the GLB object name suffix (e.g. "bird_sanctuary") */
  key: string
  /** Display label */
  label: string
  type: NodeType
  /** Route path for internal navigation (react-router). null = no route. */
  path: string | null
  /** External URL for portals/sites (full page nav). null = internal or non-navigable. */
  url: string | null
  /** GLB file path (for zones that have their own 3D scene). */
  glbPath: string | null
  /** drei Environment preset for the zone's Canvas. */
  environmentPreset?: string
  /** Parent key — for breadcrumb navigation. null = top-level. */
  parent: string | null
  /** Child keys — zones/portals/toys contained in this scene. */
  children: string[]
}

// ─── Helper to build nodes with defaults ────────────────────────────

function zone(
  key: string,
  label: string,
  opts: {
    path?: string | null
    glbPath?: string | null
    env?: string
    parent?: string
    children?: string[]
  } = {}
): SceneNode {
  return {
    key,
    label,
    type: 'zone',
    path: opts.path === null ? null : (opts.path ?? `/zone-${key.replace(/_/g, '-')}`),
    url: null,
    glbPath: opts.glbPath === null ? null : (opts.glbPath ?? `/zones/zone_${key}.glb`),
    environmentPreset: opts.env ?? 'night',
    parent: opts.parent ?? 'island',
    children: opts.children ?? [],
  }
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
    type: 'portal',
    path: null,
    url,
    glbPath: null,
    parent,
    children: [],
  }
}

function toy(
  key: string,
  label: string,
  parent: string,
  opts: { sound?: string } = {}
): SceneNode & { sound?: string } {
  return {
    key,
    label,
    type: 'toy',
    path: null,
    url: null,
    glbPath: null,
    parent,
    children: [],
    ...(opts.sound && { sound: opts.sound }),
  }
}

function site(key: string, label: string, url: string): SceneNode {
  return {
    key,
    label,
    type: 'site',
    path: null,
    url,
    glbPath: null,
    parent: null,
    children: [],
  }
}

// ─── The map ────────────────────────────────────────────────────────

const nodes: SceneNode[] = [
  // ── Island (root) ──────────────────────────────────
  {
    key: 'island',
    label: 'Sakhalteam',
    type: 'zone',
    path: '/',
    url: null,
    glbPath: '/island.glb',
    environmentPreset: 'night',
    parent: null,
    children: [
      'bird_sanctuary', 'ss_brainfog', 'cloud_town', 'tower_of_knowledge',
      'pokemon_island', 'the_tunnels', 'beach_party',
      // Direct portals on the island
      'portal_famima',
      // Coming-soon zones (no glb yet)
      'mystery_zone', 'nessie', 'flower_shop',
      // Toys on the island
      'toy_diglett', 'toy_staryu', 'toy_lapras', 'toy_pollywag',
    ],
  },

  // ── Active zones (have GLBs + routes) ──────────────
  zone('bird_sanctuary', 'Bird Sanctuary', {
    path: '/zone-bird-sanctuary',
    env: 'forest',
    children: [
      'portal_bird_bingo',
      'baby_deku', 'bird_penguin', 'bird_ostrich', 'bird_chocobo',
      'bird_kiwi', 'bird_kiwi2', 'bird_flamingo', 'tree_stump',
    ],
  }),
  zone('ss_brainfog', 'S.S. Brainfog', { env: 'sunset' }),
  zone('cloud_town', 'Cloud Town', { env: 'city' }),
  zone('tower_of_knowledge', 'Tower Of Knowledge', {
    env: 'apartment',
    children: ['reading_room', 'dojo'],
  }),
  zone('reading_room', 'Reading Room', {
    env: 'apartment',
    parent: 'tower_of_knowledge',
  }),
  zone('dojo', 'Dojo', {
    env: 'night',
    parent: 'tower_of_knowledge',
  }),
  zone('pokemon_island', 'Pokemon Island', {
    env: 'park',
    children: ['portal_pokemon_park'],
  }),
  zone('the_tunnels', 'The Tunnels', {
    env: 'night',
    children: ['portal_jr_jingle_journey'],
  }),
  zone('beach_party', 'Beach Party', { env: 'sunset' }),

  // ── Coming-soon zones (on the island, no GLB) ─────
  zone('mystery_zone', 'Mystery Zone', { glbPath: null, path: null }),
  zone('nessie', 'Nessie', { glbPath: null, path: null }),
  zone('flower_shop', 'Flower Shop', { glbPath: null, path: null }),

  // ── Portals (external site links inside zones) ─────
  portal('portal_bird_bingo', 'Bird Bingo', '/bird-bingo/', 'bird_sanctuary'),
  portal('portal_adhdo', 'ADHDO', '/adhdo/', 'island'),
  portal('portal_japanese_articles', 'Japanese Articles', '/japanese-articles/', 'island'),
  portal('portal_nikbeat', 'NikBeat', '/nikbeat/', 'island'),
  portal('portal_pokemon_park', 'Pokemon Park', '/pokemon-park/', 'island'),
  portal('portal_weather_report', 'Weather Report', '/weather-report/', 'island'),
  portal('portal_famima', 'Family Mart', '/famima/', 'island'),
  portal('portal_jr_jingle_journey', 'JR Jingle Journey', '/jr-jingle-journey/', 'the_tunnels'),

  // ── Bird sanctuary creatures (non-navigable hotspots) ──
  toy('baby_deku', 'Deku Sprout', 'bird_sanctuary'),
  toy('bird_penguin', 'Penguin', 'bird_sanctuary'),
  toy('bird_ostrich', 'Ostrich', 'bird_sanctuary'),
  toy('bird_chocobo', 'Chocobo', 'bird_sanctuary'),
  toy('bird_kiwi', 'Kiwi', 'bird_sanctuary'),
  toy('bird_kiwi2', 'Kiwi', 'bird_sanctuary'),
  toy('bird_flamingo', 'Flamingo', 'bird_sanctuary'),
  toy('tree_stump', 'Tree Stump', 'bird_sanctuary'),

  // ── Island toys ────────────────────────────────────
  toy('toy_diglett', 'Diglett', 'island', { sound: '/sounds/diglett.ogg' }),
  toy('toy_staryu', 'Staryu', 'island', { sound: '/sounds/staryu.ogg' }),
  toy('toy_lapras', 'Lapras', 'island', { sound: '/sounds/lapras.ogg' }),
  toy('toy_pollywag', 'Poliwag', 'island', { sound: '/sounds/poliwag.ogg' }),

  // ── Sister sites (for QuickNav / site map) ─────────
  site('site_adhdo', 'ADHDO', '/adhdo/'),
  site('site_bird_bingo', 'Bird Bingo', '/bird-bingo/'),
  site('site_japanese_articles', 'Japanese Articles', '/japanese-articles/'),
  site('site_nikbeat', 'NikBeat', '/nikbeat/'),
  site('site_pokemon_park', 'Pokemon Park', '/pokemon-park/'),
  site('site_weather_report', 'Weather Report', '/weather-report/'),
  site('site_famima', 'Famima', '/famima/'),
  site('site_jr_jingle_journey', 'JR Jingle Journey', '/jr-jingle-journey/'),
]

// ─── Indexed lookups ────────────────────────────────────────────────

/** All nodes keyed by their unique key */
export const sceneMap = new Map<string, SceneNode>(nodes.map(n => [n.key, n]))

/** Get a node by key, or undefined */
export function getNode(key: string): SceneNode | undefined {
  return sceneMap.get(key)
}

/** Get the ancestry chain from a node up to the root (inclusive, leaf-first) */
export function getAncestry(key: string): SceneNode[] {
  const chain: SceneNode[] = []
  let current = sceneMap.get(key)
  while (current) {
    chain.push(current)
    current = current.parent ? sceneMap.get(current.parent) : undefined
  }
  return chain
}

/** Get breadcrumb trail (root-first) */
export function getBreadcrumbs(key: string): SceneNode[] {
  return getAncestry(key).reverse()
}

/** All zones that have a path + glbPath (routable scenes) */
export function getActiveZones(): SceneNode[] {
  return nodes.filter(n => n.type === 'zone' && n.path && n.glbPath)
}

/** All zones on the island (active + coming-soon) */
export function getIslandZones(): SceneNode[] {
  const island = sceneMap.get('island')
  if (!island) return []
  return island.children
    .map(k => sceneMap.get(k))
    .filter((n): n is SceneNode => !!n && n.type === 'zone')
}

/** All sister sites */
export function getSisterSites(): SceneNode[] {
  return nodes.filter(n => n.type === 'site')
}

/** All portals (external links found inside zones) */
export function getPortals(): SceneNode[] {
  return nodes.filter(n => n.type === 'portal')
}

/**
 * Lookup helpers for scene files — match a GLB object name to its scene node.
 * Handles zone_, portal_, toy_ prefixes.
 */
export function findNodeByObjectName(objName: string): SceneNode | undefined {
  const lower = objName.toLowerCase()

  // Direct match first
  if (sceneMap.has(lower)) return sceneMap.get(lower)

  // Strip prefix and try
  const stripped = lower.replace(/^(zone|portal|toy)_/, '')
  if (sceneMap.has(stripped)) return sceneMap.get(stripped)

  // Try with prefix re-added (e.g. "portal_bird_bingo" → key is "portal_bird_bingo")
  for (const prefix of ['portal_', 'toy_']) {
    const prefixed = prefix + stripped
    if (sceneMap.has(prefixed)) return sceneMap.get(prefixed)
  }

  return undefined
}

/**
 * For IslandScene: given a zone_ object name from the GLB, get its config.
 * Returns label, url, internal flag, and active/coming-soon type.
 */
export function getZoneConfig(objName: string): {
  label: string
  url: string | null
  internal: boolean
  type: 'active' | 'coming-soon'
} {
  const node = findNodeByObjectName(objName)
  if (node && node.type === 'zone') {
    const isActive = !!(node.path && node.glbPath)
    return {
      label: node.label,
      url: node.path,
      internal: true,
      type: isActive ? 'active' : 'coming-soon',
    }
  }
  // Portal on the island
  if (node && node.type === 'portal') {
    return {
      label: node.label,
      url: node.url,
      internal: false,
      type: 'active',
    }
  }
  // Unknown — title-case the name, treat as coming-soon
  const key = objName.replace(/^(zone|portal)_/i, '').toLowerCase()
  return {
    label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    url: null,
    internal: false,
    type: 'coming-soon',
  }
}

/**
 * For ZoneScene: given a portal_ object suffix from the GLB, get its config.
 */
export function getPortalConfig(key: string): { label: string; url: string } | undefined {
  const node = sceneMap.get('portal_' + key) ?? sceneMap.get(key)
  if (node && node.url) {
    return { label: node.label, url: node.url }
  }
  return undefined
}

/**
 * For BirdSanctuaryScene: given a hotspot object name, get its config.
 */
export function getHotspotConfig(objName: string): {
  label: string
  url: string | null
  internal: boolean
} | undefined {
  const node = findNodeByObjectName(objName)
  if (!node) return undefined
  return {
    label: node.label,
    url: node.url ?? node.path,
    internal: !!node.path,
  }
}

/**
 * For ToyInteractor: get toy config by object name.
 */
export function getToyConfig(objName: string): { label: string; sound: string | null } | undefined {
  const node = sceneMap.get(objName.toLowerCase()) as (SceneNode & { sound?: string }) | undefined
  if (!node) return undefined
  return { label: node.label, sound: node.sound ?? null }
}
