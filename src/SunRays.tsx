// SunRays.tsx

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Ray {
  pos: [number, number, number];
  rot: [number, number, number];
  length: number;
  wTop: number;
  wBot: number;
  phase: number;
}

const RAYS: Ray[] = [
  { pos: [-4.5, 8, -3], rot: [0.15, 0, -0.25], length: 14, wTop: 0.25, wBot: 1.3, phase: 0.0 },
  { pos: [-2, 8.5, -3.8], rot: [0.1, 0, -0.12], length: 15, wTop: 0.2, wBot: 1.1, phase: 1.4 },
  { pos: [0.2, 9, -3.5], rot: [0.08, 0, 0.02], length: 15, wTop: 0.22, wBot: 1.2, phase: 2.1 },
  { pos: [2.4, 8.5, -3.2], rot: [0.12, 0, 0.15], length: 14, wTop: 0.2, wBot: 1.1, phase: 3.3 },
  { pos: [4.2, 8, -2.5], rot: [0.15, 0, 0.28], length: 13, wTop: 0.25, wBot: 1.3, phase: 4.7 },
];

/**
 * Warm volumetric-looking sun rays slanting down from the canopy.
 * Additive-blended translucent cones; gentle opacity breathing over time.
 */
export default function SunRays() {
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  const entries = useMemo(
    () =>
      RAYS.map((r) => ({
        ray: r,
        geometry: new THREE.CylinderGeometry(r.wTop, r.wBot, r.length, 10, 1, true),
      })),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    materialsRef.current.forEach((mat, i) => {
      if (!mat) return;
      const phase = RAYS[i].phase;
      mat.opacity = 0.09 + Math.sin(t * 0.4 + phase) * 0.025;
    });
  });

  return (
    <group ref={groupRef}>
      {entries.map(({ ray, geometry }, i) => (
        <mesh
          key={i}
          position={ray.pos}
          rotation={ray.rot}
          geometry={geometry}
          renderOrder={-1}
        >
          <meshBasicMaterial
            ref={(m) => {
              if (m) materialsRef.current[i] = m;
            }}
            color="#ffb270"
            transparent
            opacity={0.09}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
