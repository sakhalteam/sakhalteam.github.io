// ZoneBobber.tsx
//
// Gentle idle y-bob for zone-scene objects. Scans the loaded scene for any
// object whose sceneMap entry has `bob` set, records its rest y, and lifts
// it on a sine each frame. Phase is hashed from the object name so multiple
// bobbers in the same zone drift independently rather than syncing.
//
// The transform is applied to the object root, so any Blender-parented
// children (e.g. ct_toy_metal_gear_rex under portal_weather_report) ride
// along without extra wiring.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { findNodeByObjectName } from "./sceneMap";

const DEFAULT_AMPLITUDE = 0.12;
const DEFAULT_PERIOD = 3;

interface Bobbed {
  obj: THREE.Object3D;
  baseY: number;
  amplitude: number;
  freq: number;
  phase: number;
}

function hashPhase(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000) * Math.PI * 2;
}

export default function ZoneBobber({ scene }: { scene: THREE.Object3D }) {
  const bobbed = useMemo(() => {
    const list: Bobbed[] = [];
    scene.traverse((obj) => {
      const node = findNodeByObjectName(obj.name);
      if (!node?.bob) return;
      const cfg = typeof node.bob === "object" ? node.bob : {};
      list.push({
        obj,
        baseY: obj.position.y,
        amplitude: cfg.amplitude ?? DEFAULT_AMPLITUDE,
        freq: (Math.PI * 2) / (cfg.period ?? DEFAULT_PERIOD),
        phase: hashPhase(obj.name),
      });
    });
    return list;
  }, [scene]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const b of bobbed) {
      b.obj.position.y = b.baseY + Math.sin(t * b.freq + b.phase) * b.amplitude;
    }
  });

  return null;
}
