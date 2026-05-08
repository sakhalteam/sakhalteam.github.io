// environment/subsystems/SpriteDrift.tsx
//
// Generic 2D billboard sprite drift system. Loads N transparent PNGs,
// scatters M billboards across a configurable layer, and drifts them
// sideways. Inspired by SMRPG Nimbus Land's animated cloud band, but
// the component is texture-agnostic — clouds, birds, fish, dust, ash,
// bubbles, fairies, snowflakes are all the same machine with different
// PNGs and tuning.
//
// Per-zone configuration: pass props directly when used as a child, or
// via AtmosphereConfig.options.sprite_drift when mounted as a registered
// atmosphere subsystem.
//
// Optional: when mounted inside an AtmosphereProvider, sprite tint follows
// the atmosphere's cloudColor (time-of-day + weather) automatically.
// Disable via `followAtmosphere={false}` for non-cloud sprites that
// shouldn't go peachy at sunrise.

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAtmosphereOptional } from "../AtmosphereContext";

interface SpriteState {
  speciesIndex: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  flipX: 1 | -1;
  speed: number;
  baseOpacity: number;
  /** 0..1 — used as both bob phase and animation frame offset. */
  phase: number;
}

/** Resolved animation metadata per species after normalization. */
interface Species {
  /** Index into the global maps[] array where this species' frames start. */
  frameStart: number;
  /** Number of frames (1 = static, 2+ = animated). */
  frameCount: number;
  /** Playback speed in frames per second. Ignored when frameCount === 1. */
  fps: number;
}

/**
 * Texture entry. Three forms:
 *  - string                                 → single static frame, weight 1
 *  - { url, weight?, flipChance? }          → single static frame, configurable
 *  - { frames, fps?, weight?, flipChance? } → multi-frame animation (e.g. flapping bird)
 *
 * `frames` is an ordered list of frame URLs. At runtime each sprite cycles
 * through them at the species' fps, with a per-sprite phase offset so the
 * flock isn't flapping in lockstep.
 *
 * `weight` is relative — [{w:1},{w:5}] means the second is 5x as common.
 * `flipChance` (0–1) horizontally mirrors a fraction of spawned sprites.
 */
export type SpriteTexture =
  | string
  | { url: string; weight?: number; flipChance?: number }
  | {
      frames: string[];
      fps?: number;
      weight?: number;
      flipChance?: number;
    };

// Module-level stable references. If these were inline defaults on the
// destructured props, every parent re-render (e.g. hovering a toy) would
// allocate a new array, busting the `states` useMemo and rerolling all
// the random positions/scales — the "parallel-timeline" jump bug.
//
// These defaults are intentionally modest. They give a "sane fallback"
// look for any zone that enables sprite_drift without options. Zones that
// want a specific aesthetic (Cloud Town's wall-of-clouds, Bird Sanctuary's
// flock, etc.) should override via AtmosphereConfig.options.sprite_drift.
const DEFAULT_SPEED_RANGE: [number, number] = [0.6, 1.4];
const DEFAULT_SCALE_RANGE: [number, number] = [4, 14];
const DEFAULT_OPACITY_RANGE: [number, number] = [0.4, 1.0];

const DEFAULT_TEXTURES: SpriteTexture[] = [
  { url: `${import.meta.env.BASE_URL}clouds/m07_cloud01.png`, weight: 1 },
  { url: `${import.meta.env.BASE_URL}clouds/m07_cloud02.png`, weight: 1 },
];

const DEFAULT_FPS = 6;

function normalizeTextures(input: SpriteTexture[]): {
  urls: string[];
  weights: number[];
  flipChances: number[];
  species: Species[];
} {
  const urls: string[] = [];
  const weights: number[] = [];
  const flipChances: number[] = [];
  const species: Species[] = [];
  for (const t of input) {
    let frames: string[];
    let fps = DEFAULT_FPS;
    let weight = 1;
    let flipChance = 0;
    if (typeof t === "string") {
      frames = [t];
    } else if ("frames" in t) {
      frames = t.frames;
      fps = t.fps ?? DEFAULT_FPS;
      weight = t.weight ?? 1;
      flipChance = t.flipChance ?? 0;
    } else {
      frames = [t.url];
      weight = t.weight ?? 1;
      flipChance = t.flipChance ?? 0;
    }
    const frameStart = urls.length;
    for (const url of frames) urls.push(url);
    species.push({ frameStart, frameCount: frames.length, fps });
    weights.push(weight);
    flipChances.push(flipChance);
  }
  return { urls, weights, flipChances, species };
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

export interface SpriteDriftProps {
  /**
   * Sprite PNG urls (clouds, birds, whatever). Plain strings for equal
   * weight, or { url, weight, flipChance } for finer control.
   * Example: [{ url: gull, weight: 1 }, { url: gull, weight: 5 }]
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
  /** When true, flipped sprites drift in the opposite direction. Use for
   *  directional sprites (birds, fish) where a "flipped" sprite is one
   *  *facing* the other way and should fly/swim that way. Leave false
   *  for symmetric sprites (clouds, dust) where flip is purely cosmetic. */
  flipReversesDrift?: boolean;
  /** Which way your unflipped PNG assets naturally face. 1 = right (+X),
   *  -1 = left (-X). Only matters when `flipReversesDrift` is true.
   *  If you turn flipReversesDrift on and your sprites all fly backwards,
   *  flip this knob. Default 1 (right-facing). */
  baseFacing?: 1 | -1;
  /** Render order — keep below 3D clouds and scene geometry. */
  renderOrder?: number;
}

export default function SpriteDrift({
  textures = DEFAULT_TEXTURES,
  count = 80,
  speed = 2,
  speedRange = DEFAULT_SPEED_RANGE,
  minX = -100,
  maxX = 100,
  minY = 0,
  maxY = 30,
  minZ = -100,
  maxZ = -30,
  scaleRange = DEFAULT_SCALE_RANGE,
  opacityRange = DEFAULT_OPACITY_RANGE,
  opacity = 1,
  edgeFade = 20,
  bobAmplitude = 0,
  bobSpeed = 0.3,
  tint = "#ffffff",
  followAtmosphere = true,
  flipReversesDrift = false,
  baseFacing = 1,
  renderOrder = -10,
}: SpriteDriftProps) {
  const atmosphere = useAtmosphereOptional();
  const { urls, weights, flipChances, species } = useMemo(
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
      const speciesIndex = weightedPick(weights);
      const flipX: 1 | -1 = Math.random() < flipChances[speciesIndex] ? -1 : 1;
      return {
        speciesIndex,
        flipX,
        // Even initial spread across X so nothing pops on first frame.
        x: rand(minX, maxX),
        y: rand(minY, maxY),
        z: rand(minZ, maxZ),
        scale: rand(scaleRange[0], scaleRange[1]),
        speed: rand(speedRange[0], speedRange[1]),
        baseOpacity: rand(opacityRange[0], opacityRange[1]),
        phase: Math.random(),
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

      const dir = flipReversesDrift ? baseFacing * s.flipX : 1;
      s.x += speed * s.speed * dir * delta;
      if (s.x > maxX) s.x -= range;
      else if (s.x < minX) s.x += range;

      const y = bobAmplitude
        ? s.y + Math.sin(t * bobSpeed + s.phase * Math.PI * 2) * bobAmplitude
        : s.y;

      sprite.position.set(s.x, y, s.z);
      sprite.scale.setScalar(s.scale);

      // Linear fade near horizontal edges so sprite doesn't snap on wrap.
      const distFromEdge = Math.min(s.x - minX, maxX - s.x);
      const edge = edgeFade > 0 ? Math.min(1, distFromEdge / edgeFade) : 1;

      const mat = sprite.material as THREE.SpriteMaterial;
      mat.opacity = s.baseOpacity * opacity * edge;

      // Animate species with multiple frames. Per-sprite phase offset
      // ensures a flock of birds doesn't flap in unison.
      const sp = species[s.speciesIndex];
      if (sp.frameCount > 1) {
        const frameIdx = Math.floor(
          (t * sp.fps + s.phase * sp.frameCount) % sp.frameCount,
        );
        const globalIdx = sp.frameStart + frameIdx;
        const nextMap =
          s.flipX === -1 ? flippedMaps[globalIdx] : maps[globalIdx];
        if (mat.map !== nextMap) mat.map = nextMap;
      }
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
                ? flippedMaps[species[s.speciesIndex].frameStart]
                : maps[species[s.speciesIndex].frameStart]
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
