// environment/subsystems/SpriteClouds.tsx
//
// 2D billboard cloud sprites drifting across a layer behind the scene.
// Inspired by Super Mario RPG's Nimbus Land — a cheap, cheesy way to
// add cloudiness without volumetric geometry. Loads N transparent PNGs,
// scatters M billboards across them, and drifts everything sideways.
//
// Self-contained: no AtmosphereContext dependency. Tune via props.

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface SpriteState {
  textureIndex: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  baseOpacity: number;
  phase: number;
}

const DEFAULT_TEXTURES = [
  `${import.meta.env.BASE_URL}clouds/m07_cloud01.png`,
  `${import.meta.env.BASE_URL}clouds/m07_cloud02.png`,
  `${import.meta.env.BASE_URL}clouds/smile_cloud_bright.png`,
];

interface Props {
  /** Cloud PNG urls. Order doesn't matter; sprites pick randomly. */
  textures?: string[];
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
  /** Tint multiplied into the texture (use for sunset / overcast moods). */
  tint?: THREE.ColorRepresentation;
  /** Render order — keep below 3D clouds and scene geometry. */
  renderOrder?: number;
}

export default function SpriteClouds({
  textures = DEFAULT_TEXTURES,
  count = 500,
  speed = 2,
  speedRange = [0.6, 1.4],
  minX = -200,
  maxX = 200,
  minY = -50,
  maxY = 30,
  minZ = -300,
  maxZ = 140,
  scaleRange = [2, 16],
  opacityRange = [0.3, 1.0],
  opacity = 1,
  edgeFade = 20,
  bobAmplitude = 0,
  bobSpeed = 0.3,
  tint = "#ffffff",
  renderOrder = -10,
}: Props) {
  // useLoader caches by url, so repeated mounts are free.
  const maps = useLoader(THREE.TextureLoader, textures) as THREE.Texture[];
  useMemo(() => {
    for (const t of maps) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }
  }, [maps]);

  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const tintColor = useMemo(() => new THREE.Color(tint), [tint]);

  const states = useMemo<SpriteState[]>(() => {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    return Array.from({ length: count }, () => ({
      textureIndex: Math.floor(Math.random() * Math.max(textures.length, 1)),
      // Even initial spread across X so nothing pops on first frame.
      x: rand(minX, maxX),
      y: rand(minY, maxY),
      z: rand(minZ, maxZ),
      scale: rand(scaleRange[0], scaleRange[1]),
      speed: rand(speedRange[0], speedRange[1]),
      baseOpacity: rand(opacityRange[0], opacityRange[1]),
      phase: Math.random() * Math.PI * 2,
    }));
  }, [
    count,
    textures.length,
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

  if (!textures.length) return null;

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
            map={maps[s.textureIndex]}
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
