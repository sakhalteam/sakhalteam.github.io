// environment/subsystems/DriftClouds.tsx
//
// Drifting cloud puffs along world -Z. Density / tint / opacity are driven
// by the atmosphere's cloudCover + cloudColor + cloudOpacity params.
// Ported from the original CloudTownExtras DriftingClouds with minor
// adjustments so weather changes recycle clouds visually.

import { Cloud, Clouds } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAtmosphere } from "../AtmosphereContext";

interface DriftState {
  x: number;
  y: number;
  z: number;
  scaleMax: number;
  seed: number;
}

interface Props {
  /** Max puff count when cloudCover === 1. Actual count scales linearly. */
  maxCount?: number;
  speed?: number;
  spawnZ?: number;
  despawnZ?: number;
  spread?: number;
  height?: number;
  heightVariance?: number;
  fadeRange?: number;
}

export default function DriftClouds({
  maxCount = 24,
  speed = 4,
  spawnZ = 90,
  despawnZ = -90,
  spread = 80,
  height = -10,
  heightVariance = 40,
  fadeRange = 25,
}: Props) {
  const { params } = useAtmosphere();
  const activeClouds = params.cloudCover * maxCount;
  const refs = useRef<(THREE.Group | null)[]>([]);

  const states = useMemo<DriftState[]>(() => {
    const range = spawnZ - despawnZ;
    return Array.from({ length: maxCount }, (_, i) => ({
      x: (Math.random() - 0.5) * spread,
      y: height + (Math.random() - 0.5) * heightVariance,
      // Even initial distribution — no births visible on first render.
      z: spawnZ - ((i + 0.5) / Math.max(maxCount, 1)) * range,
      scaleMax: 0.7 + Math.random() * 0.8,
      seed: Math.floor(Math.random() * 10000),
    }));
  }, [maxCount, spawnZ, despawnZ, spread, height, heightVariance]);

  useFrame((_, delta) => {
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const g = refs.current[i];
      if (!g) continue;

      const activation = THREE.MathUtils.clamp(activeClouds - i, 0, 1);
      g.visible = activation > 0.01;
      if (activation <= 0.01) continue;

      s.z -= speed * delta;
      if (s.z < despawnZ) {
        s.z = spawnZ;
        s.x = (Math.random() - 0.5) * spread;
        s.y = height + (Math.random() - 0.5) * heightVariance;
      }

      const fromSpawn = spawnZ - s.z;
      const toDespawn = s.z - despawnZ;
      const fadeIn = Math.min(1, Math.max(0, fromSpawn / fadeRange));
      const fadeOut = Math.min(1, Math.max(0, toDespawn / fadeRange));
      const fade = Math.min(fadeIn, fadeOut);

      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(s.scaleMax * fade * activation);
    }
  });

  if (activeClouds <= 0.01) return null;

  const tintHex = `#${params.cloudColor.getHexString()}`;
  const cloudOpacities = states.map(
    (_, i) =>
      params.cloudOpacity * THREE.MathUtils.clamp(activeClouds - i, 0, 1),
  );

  return (
    <Clouds material={THREE.MeshLambertMaterial} limit={400}>
      {states.map((s, i) => (
        <Cloud
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
          seed={s.seed}
          segments={18}
          bounds={[8, 2, 2]}
          volume={6}
          smallestVolume={0.4}
          growth={3}
          opacity={cloudOpacities[i]}
          color={tintHex}
        />
      ))}
    </Clouds>
  );
}
