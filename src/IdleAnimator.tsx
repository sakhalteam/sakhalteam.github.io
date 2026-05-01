// IdleAnimator.tsx
//
// One home for every idle animation in the scene. Scans the loaded scene for
// any object whose sceneMap entry has an `idle` field, records its rest
// transform, and drives it each frame from a tiny registry keyed by IdleKind.
//
// Works on any node type — toys, zones, portals — so "undulate the floating
// Weather Report portal", "gentle float on water pokemon", and (future)
// "slow-spin crystal" all share the same API:
//
//   idle: "undulate"                                  // use defaults
//   idle: { kind: "undulate", amplitude: 0.3, period: 6 }   // tune it
//   idleOffset: 0.25                                  // shift phase by 1/4 cycle
//
// Note: idle motion (always-on, here) is deliberately separate from
// `animation` (click-triggered, in ToyInteractor). Some value names overlap
// historically — `idle: "undulate"` and `animation: "bob"` both produce a
// y-axis sine — but they're independent code paths and never interfere.
//
// Click animations in ToyInteractor write position.y = baseY + offset and run
// in their own useFrame. Mounting IdleAnimator BEFORE ToyInteractor in the
// tree means the click offset wins for the duration of the click; the idle
// resumes cleanly on the next frame after the click finishes.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { findNodeByObjectName, type IdleConfig, type IdleKind } from "./sceneMap";

interface IdleDef {
  defaults: { amplitude: number; period: number; axis: "x" | "y" | "z" };
  apply: (
    obj: THREE.Object3D,
    base: { x: number; y: number; z: number; rx: number; ry: number; rz: number },
    t: number,
    phase: number,
    amplitude: number,
    freq: number,
    axis: "x" | "y" | "z",
  ) => void;
}

const TAU = Math.PI * 2;

const IDLE: Record<Exclude<IdleKind, "none">, IdleDef> = {
  // Gentle y-axis undulation, strong enough to read at a glance
  // (zones/portals default).
  undulate: {
    defaults: { amplitude: 0.12, period: 3, axis: "y" },
    apply: (obj, base, t, phase, amp, freq) => {
      obj.position.y = base.y + Math.sin(t * freq + phase) * amp;
    },
  },
  // Subtle y-float, for water-type toys that should look buoyant.
  float: {
    defaults: { amplitude: 0.06, period: TAU / 0.8, axis: "y" }, // ≈7.85s
    apply: (obj, base, t, phase, amp, freq) => {
      obj.position.y = base.y + Math.sin(t * freq + phase) * amp;
    },
  },
  // Slow continuous rotation (full turn per `period` seconds) on chosen axis.
  spin: {
    defaults: { amplitude: TAU, period: 20, axis: "y" },
    apply: (obj, base, t, phase, amp, _freq, axis) => {
      const rot = base[`r${axis}` as const] + (((t / 20) * amp + phase) % TAU);
      obj.rotation[axis] = rot;
    },
  },
};

interface Bound {
  obj: THREE.Object3D;
  base: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  def: IdleDef;
  amplitude: number;
  freq: number;
  axis: "x" | "y" | "z";
  phase: number;
}

function hashPhase(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return (((h >>> 0) % 1000) / 1000) * TAU;
}

function normalize(idle: IdleConfig): {
  kind: IdleKind;
  amplitude?: number;
  period?: number;
  axis?: "x" | "y" | "z";
} {
  return typeof idle === "string" ? { kind: idle } : idle;
}

export default function IdleAnimator({ scene }: { scene: THREE.Object3D }) {
  const bound = useMemo(() => {
    const list: Bound[] = [];
    scene.traverse((obj) => {
      const node = findNodeByObjectName(obj.name);
      if (!node?.idle) return;
      const cfg = normalize(node.idle);
      if (cfg.kind === "none") return;
      const def = IDLE[cfg.kind];
      if (!def) return;
      const amplitude = cfg.amplitude ?? def.defaults.amplitude;
      const period = cfg.period ?? def.defaults.period;
      const axis = cfg.axis ?? def.defaults.axis;
      list.push({
        obj,
        base: {
          x: obj.position.x,
          y: obj.position.y,
          z: obj.position.z,
          rx: obj.rotation.x,
          ry: obj.rotation.y,
          rz: obj.rotation.z,
        },
        def,
        amplitude,
        freq: TAU / period,
        axis,
        phase:
          node.idleOffset === undefined
            ? hashPhase(obj.name)
            : THREE.MathUtils.euclideanModulo(node.idleOffset, 1) * TAU,
      });
    });
    return list;
  }, [scene]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const b of bound) {
      b.def.apply(b.obj, b.base, t, b.phase, b.amplitude, b.freq, b.axis);
    }
  });

  return null;
}
