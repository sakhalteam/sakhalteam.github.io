// CloudTownExtras.tsx
// Sky shader + drifting clouds for zone_cloud_town.

import { Cloud, Clouds, Sky } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface DriftState {
  x: number;
  y: number;
  z: number;
  scaleMax: number;
  seed: number;
}

interface DriftingCloudsProps {
  count?: number;
  /** World units / second along -Z. */
  speed?: number;
  /** Cloud lifecycle endpoints along Z (drift axis). */
  spawnZ?: number;
  despawnZ?: number;
  /** X spread perpendicular to drift. */
  spread?: number;
  height?: number;
  heightVariance?: number;
  /** Distance over which clouds fade in (after spawn) and fade out (before despawn). */
  fadeRange?: number;
}

/**
 * Spawns N cloud puffs that drift along world -Z. Each one fades in via
 * scale ramp after spawn, drifts across, fades out before despawn, then
 * recycles back to spawnZ with new randomized x/y.
 *
 * Clouds are pre-distributed evenly across the full path on init (using
 * (i + 0.5) / count * range offset) so no births are visible on first load
 * and spacing stays constant as each cloud wraps.
 */
function DriftingClouds({
  count = 14,
  speed = 4,
  spawnZ = 90,
  despawnZ = -90,
  spread = 80,
  height = -10,
  heightVariance = 40,
  fadeRange = 25,
}: DriftingCloudsProps) {
  const refs = useRef<(THREE.Group | null)[]>([]);

  const states = useMemo<DriftState[]>(() => {
    const range = spawnZ - despawnZ;
    return Array.from({ length: count }, (_, i) => ({
      x: (Math.random() - 0.5) * spread,
      y: height + (Math.random() - 0.5) * heightVariance,
      // (i + 0.5) / count distributes evenly with none at the boundary edges,
      // so all clouds are mid-path on first render — no births visible on load.
      z: spawnZ - ((i + 0.5) / count) * range,
      scaleMax: 0.7 + Math.random() * 0.8,
      seed: Math.floor(Math.random() * 10000),
    }));
  }, [count, spawnZ, despawnZ, spread, height, heightVariance]);

  useFrame((_, delta) => {
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const g = refs.current[i];
      if (!g) continue;

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
      g.scale.setScalar(s.scaleMax * fade);
    }
  });

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
          opacity={0.85}
          color="#ffffff"
        />
      ))}
    </Clouds>
  );
}

export default function CloudTownExtras() {
  return (
    <>
      <Sky
        distance={900}
        inclination={0.49}
        azimuth={0.25}
        turbidity={6}
        rayleigh={1.5}
        mieCoefficient={0.005}
        mieDirectionalG={0.75}
      />
      <DriftingClouds />
    </>
  );
}
