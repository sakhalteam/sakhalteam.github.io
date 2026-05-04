// environment/subsystems/SpriteClouds.tsx
//
// 2D billboard cloud sprites drifting across a layer behind the scene.
// Inspired by Super Mario RPG's Nimbus Land — a cheap, cheesy way to
// add cloudiness without volumetric geometry. Loads N transparent PNGs,
// scatters M billboards across them, and drifts everything sideways.
//
// Optional: when mounted inside an AtmosphereProvider, sprite tint follows
// the atmosphere's cloudColor (time-of-day + weather) automatically.

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAtmosphereOptional } from "../AtmosphereContext";

interface SpriteState {
  textureIndex: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  flipX: 1 | -1;
  speed: number;
  baseOpacity: number;
  phase: number;
}

/**
 * Texture entry: a url string for uniform-weight clouds, or an object
 * with explicit weight to control how often that texture is picked.
 * Weights are relative — [{w:1},{w:5}] means the second is 5x as common.
 *
 * `flipChance` (0–1) randomly mirrors the sprite horizontally on spawn —
 * useful for adding visual variety from a small texture set.
 */
export type SpriteTexture =
  | string
  | { url: string; weight?: number; flipChance?: number };

// Module-level stable references. If these were inline defaults on the
// destructured props, every parent re-render (e.g. hovering a toy) would
// allocate a new array, busting the `states` useMemo and rerolling all
// the random positions/scales — the "parallel-timeline" jump bug.
const DEFAULT_SPEED_RANGE: [number, number] = [0.6, 1.4];
const DEFAULT_SCALE_RANGE: [number, number] = [2, 32];
const DEFAULT_OPACITY_RANGE: [number, number] = [0.3, 1.0];

const DEFAULT_TEXTURES: SpriteTexture[] = [
  {
    url: `${import.meta.env.BASE_URL}clouds/m07_cloud01.png`,
    weight: 6,
    flipChance: 0.2,
  },
  { url: `${import.meta.env.BASE_URL}clouds/m07_cloud02.png`, weight: 3 },
  {
    url: `${import.meta.env.BASE_URL}clouds/smile_cloud_bright.png`,
    weight: 0.05,
  },
  {
    url: `${import.meta.env.BASE_URL}clouds/smile_cloud.png`,
    weight: 0.05,
  },
];

function normalizeTextures(input: SpriteTexture[]): {
  urls: string[];
  weights: number[];
  flipChances: number[];
} {
  const urls: string[] = [];
  const weights: number[] = [];
  const flipChances: number[] = [];
  for (const t of input) {
    if (typeof t === "string") {
      urls.push(t);
      weights.push(1);
      flipChances.push(0);
    } else {
      urls.push(t.url);
      weights.push(t.weight ?? 1);
      flipChances.push(t.flipChance ?? 0);
    }
  }
  return { urls, weights, flipChances };
}

function weightedPick(weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

interface Props {
  /**
   * Cloud PNG urls. Pass plain strings for equal weight, or
   * { url, weight } objects to dial individual textures up/down.
   * Example: [{ url: smile, weight: 1 }, { url: wispy, weight: 5 }]
   */
  textures?: SpriteTexture[];
  /** Total billboard count distributed across the layer. */
  count?: number;
  /** Drift along world +X (px/sec). Negative drifts left. */
  speed?: number;
  /** Per-sprite speed jitter as a multiplier range, e.g. [0.6, 1.4]. */
  speedRange?: [number, number];
  /** X bounds. Sprites wrap from maxX back to minX. */
  minX?: number;
  maxX?: number;
  /** Vertical band the sprites occupy. */
  minY?: number;
  maxY?: number;
  /** Depth band. Smaller z = farther back if your scene faces -Z. */
  minZ?: number;
  maxZ?: number;
  /** Uniform scale range applied to each sprite. */
  scaleRange?: [number, number];
  /** Base opacity range per sprite. Multiplied by global opacity. */
  opacityRange?: [number, number];
  /** Global opacity multiplier (e.g. drive from atmosphere later). */
  opacity?: number;
  /** Fade margin at horizontal edges to avoid pop-in. World units. */
  edgeFade?: number;
  /** Optional gentle vertical bob — amplitude in world units (0 = off). */
  bobAmplitude?: number;
  bobSpeed?: number;
  /** Tint multiplied into the texture (use for sunset / overcast moods).
   *  When `followAtmosphere` is on AND an AtmosphereProvider is mounted,
   *  this is multiplied on top of the atmosphere's cloudColor. */
  tint?: THREE.ColorRepresentation;
  /** When true (default), if mounted inside an AtmosphereProvider, the
   *  sprites tint themselves using params.cloudColor (time-of-day + weather).
   *  Set false to ignore atmosphere and use the `tint` prop verbatim. */
  followAtmosphere?: boolean;
  /** Render order — keep below 3D clouds and scene geometry. */
  renderOrder?: number;
}

export default function SpriteClouds({
  textures = DEFAULT_TEXTURES,
  count = 500,
  speed = 2,
  speedRange = DEFAULT_SPEED_RANGE,
  minX = -200,
  maxX = 200,
  minY = -50,
  maxY = 30,
  minZ = -300,
  maxZ = 140,
  scaleRange = DEFAULT_SCALE_RANGE,
  opacityRange = DEFAULT_OPACITY_RANGE,
  opacity = 1,
  edgeFade = 20,
  bobAmplitude = 0,
  bobSpeed = 0.3,
  tint = "#ffffff",
  followAtmosphere = true,
  renderOrder = -10,
}: Props) {
  const atmosphere = useAtmosphereOptional();
  const { urls, weights, flipChances } = useMemo(
    () => normalizeTextures(textures),
    [textures],
  );

  // useLoader caches by url, so repeated mounts are free.
  const maps = useLoader(THREE.TextureLoader, urls) as THREE.Texture[];
  useMemo(() => {
    for (const t of maps) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }
  }, [maps]);

  // Sprites can't be mirrored via scale.x — the shader uses length() and
  // strips the sign. We build a flipped clone per texture (UVs reversed
  // via repeat/offset) and route flipped sprites to it.
  const flippedMaps = useMemo(() => {
    return maps.map((m) => {
      const f = m.clone();
      f.wrapS = THREE.RepeatWrapping;
      f.repeat.x = -1;
      f.offset.x = 1;
      f.needsUpdate = true;
      return f;
    });
  }, [maps]);

  const refs = useRef<(THREE.Sprite | null)[]>([]);
  // Final tint = prop tint * (atmosphere.cloudColor if followAtmosphere).
  // The atmosphere color is recomputed continuously by AtmosphereProvider,
  // so this useMemo re-runs whenever time/weather change.
  const atmosphereCloudColor =
    followAtmosphere && atmosphere ? atmosphere.params.cloudColor : null;
  const tintColor = useMemo(() => {
    const c = new THREE.Color(tint);
    if (atmosphereCloudColor) c.multiply(atmosphereCloudColor);
    return c;
  }, [tint, atmosphereCloudColor]);

  const states = useMemo<SpriteState[]>(() => {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    return Array.from({ length: count }, () => {
      const textureIndex = weightedPick(weights);
      const flipX: 1 | -1 = Math.random() < flipChances[textureIndex] ? -1 : 1;
      return {
        textureIndex,
        flipX,
        // Even initial spread across X so nothing pops on first frame.
        x: rand(minX, maxX),
        y: rand(minY, maxY),
        z: rand(minZ, maxZ),
        scale: rand(scaleRange[0], scaleRange[1]),
        speed: rand(speedRange[0], speedRange[1]),
        baseOpacity: rand(opacityRange[0], opacityRange[1]),
        phase: Math.random() * Math.PI * 2,
      };
    });
  }, [
    count,
    weights,
    flipChances,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    scaleRange,
    speedRange,
    opacityRange,
  ]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const range = maxX - minX;
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const sprite = refs.current[i];
      if (!sprite) continue;

      s.x += speed * s.speed * delta;
      if (s.x > maxX) s.x -= range;
      else if (s.x < minX) s.x += range;

      const y = bobAmplitude
        ? s.y + Math.sin(t * bobSpeed + s.phase) * bobAmplitude
        : s.y;

      sprite.position.set(s.x, y, s.z);
      sprite.scale.setScalar(s.scale);

      // Linear fade near horizontal edges so cloud doesn't snap on wrap.
      const distFromEdge = Math.min(s.x - minX, maxX - s.x);
      const edge = edgeFade > 0 ? Math.min(1, distFromEdge / edgeFade) : 1;

      const mat = sprite.material as THREE.SpriteMaterial;
      mat.opacity = s.baseOpacity * opacity * edge;
    }
  });

  if (!urls.length) return null;

  return (
    <group renderOrder={renderOrder}>
      {states.map((s, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          renderOrder={renderOrder}
        >
          <spriteMaterial
            map={
              s.flipX === -1
                ? flippedMaps[s.textureIndex]
                : maps[s.textureIndex]
            }
            color={tintColor}
            transparent
            depthWrite={false}
            depthTest
            toneMapped={false}
            opacity={s.baseOpacity * opacity}
          />
        </sprite>
      ))}
    </group>
  );
}
