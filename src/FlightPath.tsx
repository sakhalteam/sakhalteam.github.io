// FlightPath.tsx
//
// Pure movement driver for a single flying object. Animates its position
// along a series of straight-line segments defined by Blender empties, with
// fade-in/out at the ends of each cycle, automatic nose-to-path alignment,
// barrel rolls near trigger empties, and a "ranged vs grounded" variant
// toggle for ships that have both wings-out and wings-folded subtrees.
//
// Click handling, hover labels, outline glow, sounds — all of that comes
// from ToyInteractor / HotspotHitbox just like any other object. FlightPath
// only writes the obj's transform every frame; the rest of the system sees
// a moving toy and treats it normally.
//
// "Authored forward" defaults to the model's local +Z. To override, drop a
// `<obj>_nose` empty at the tip of the nose — vector from origin to that
// empty becomes forward.
//
// Blender-side contract:
//   <obj>                                            the flying mesh
//   <pathGroup>_flight_start[_NN]                    cycle-start empty
//   <pathGroup>_flight_end[_NN] | _flight_finish[_NN] cycle-end empty
//   <obj>_nose                                       optional forward override
//   <any_prefix>_barrel_roll_trigger[_NN]            optional roll trigger
//
// `pathGroup` defaults to the object name, so single-flier setups don't need
// any extra config. For multi-ship squadrons (e.g. four arwings on the same
// path), set `pathGroup: "arwing"` on each toy and they all share the empties
// — stagger them with `phase: 0 / 0.25 / 0.5 / 0.75` so they don't stack.
//
// Numbered suffixes (_01, _02, …) define multiple start/end pairs; each full
// cycle advances to the next pair (wrapping). Start and end are paired by
// matching suffix. Unsuffixed is also valid.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneOptions } from "./SceneOptionsContext";
import { useDebugHitboxes } from "./debugFlags";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SHOW_BARREL_ROLL_TRIGGERS_WITH_DEBUG_HITBOXES = true;

function distanceToSegment(
  point: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
) {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq === 0) return point.distanceTo(a);
  const t = THREE.MathUtils.clamp(
    point.clone().sub(a).dot(ab) / lengthSq,
    0,
    1,
  );
  return point.distanceTo(a.clone().addScaledVector(ab, t));
}

/**
 * Classify a descendant of the flying object into a variant group.
 * `all_range_mode` substring → "ranged"; `_closed`/`_feet` → "grounded".
 * Other names are always-visible structural parts.
 */
function classifyVariant(name: string): "ranged" | "grounded" | null {
  const n = name.toLowerCase();
  if (n.includes("all_range_mode")) return "ranged";
  if (n.includes("_closed") || n.includes("_feet")) return "grounded";
  return null;
}

export interface FlightPathConfig {
  /** Object name of the flying mesh, e.g. "ct_toy_fox_arwing". */
  objectName: string;
  /** Prefix used to find `<group>_flight_start_NN` empties. Defaults to
   *  `objectName`. Multiple flying toys can share a group. */
  pathGroup?: string;
  /** Cycle-clock offset on mount, 0..1. Stagger several toys on one
   *  pathGroup with different phases so they trail each other instead of
   *  stacking. Defaults to 0. */
  phaseOffset?: number;
  /** Seconds per full cycle (start → end). */
  duration: number;
  /** Fraction of cycle spent fading in at start. 0..0.5. */
  fadeIn: number;
  /** Fraction of cycle spent fading out at end. 0..0.5. */
  fadeOut: number;
  /** Extra yaw in radians on top of auto-alignment. Usually 0. */
  headingOffset?: number;
  /** Local-space pitch correction in radians. */
  pitchOffset?: number;
  /** Local-space roll correction in radians. */
  rollOffset?: number;
  /** Seconds for one full barrel roll (2π). Defaults to 0.6. */
  rollDuration?: number;
  /** World distance to any `*_barrel_roll_trigger` empty that fires a
   *  barrel roll. Defaults to 4. */
  rollTriggerRadius?: number;
}

export default function FlightPath({
  scene,
  config,
}: {
  scene: THREE.Object3D;
  config: FlightPathConfig;
}) {
  const debugHitboxes = useDebugHitboxes();
  const data = useMemo(() => {
    const objLower = config.objectName.toLowerCase();
    const groupLower = (config.pathGroup ?? config.objectName).toLowerCase();
    const escaped = groupLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startRe = new RegExp(`^${escaped}_flight_start(?:_(\\d+))?$`);
    const endRe = new RegExp(`^${escaped}_flight_(?:end|finish)(?:_(\\d+))?$`);
    const noseName = `${objLower}_nose`;
    const rollTriggerRe = /_barrel_roll_trigger(?:_\d+)?$/;

    let obj: THREE.Object3D | undefined;
    let noseEmpty: THREE.Object3D | undefined;
    const startMap = new Map<string, THREE.Vector3>();
    const endMap = new Map<string, THREE.Vector3>();
    const markerObjects: THREE.Object3D[] = [];
    const rollTriggers: THREE.Vector3[] = [];
    scene.updateWorldMatrix(true, true);
    scene.traverse((o) => {
      const n = o.name.toLowerCase();
      if (n === objLower) {
        obj = o;
        return;
      }
      if (n === noseName) {
        noseEmpty = o;
        markerObjects.push(o);
        return;
      }
      const sm = n.match(startRe);
      if (sm) {
        startMap.set(sm[1] ?? "", o.getWorldPosition(new THREE.Vector3()));
        markerObjects.push(o);
        return;
      }
      const em = n.match(endRe);
      if (em) {
        endMap.set(em[1] ?? "", o.getWorldPosition(new THREE.Vector3()));
        markerObjects.push(o);
        return;
      }
      if (rollTriggerRe.test(n)) {
        rollTriggers.push(o.getWorldPosition(new THREE.Vector3()));
        markerObjects.push(o);
      }
    });

    if (!obj) return null;

    const keys = [...new Set([...startMap.keys(), ...endMap.keys()])].sort();
    const pairs: { startPos: THREE.Vector3; endPos: THREE.Vector3 }[] = [];
    for (const k of keys) {
      const s = startMap.get(k);
      const e = endMap.get(k);
      if (s && e) pairs.push({ startPos: s, endPos: e });
    }
    if (pairs.length === 0) return null;

    let authoredForwardLocal = new THREE.Vector3(0, 0, 1);
    if (noseEmpty) {
      const noseWorld = noseEmpty.getWorldPosition(new THREE.Vector3());
      const objWorld = obj.getWorldPosition(new THREE.Vector3());
      const fwdWorld = noseWorld.sub(objWorld);
      if (fwdWorld.lengthSq() > 1e-6) {
        const invQuat = obj.quaternion.clone().invert();
        authoredForwardLocal = fwdWorld.applyQuaternion(invQuat).normalize();
      }
    }

    // Collect meshes for fade-in/out opacity control.
    const meshes: THREE.Mesh[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes.push(m);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        mat.transparent = true;
        mat.opacity = 0;
      }
    });

    // Detect ranged/grounded variant subtrees on the object's direct children.
    const rangedRoots: THREE.Object3D[] = [];
    const groundedRoots: THREE.Object3D[] = [];
    for (const child of obj.children) {
      const cls = classifyVariant(child.name);
      if (cls === "ranged") rangedRoots.push(child);
      else if (cls === "grounded") groundedRoots.push(child);
    }
    const hasVariants = rangedRoots.length > 0 || groundedRoots.length > 0;

    return {
      obj,
      pairs,
      markerObjects,
      rollTriggers,
      meshes,
      basePosition: obj.position.clone(),
      baseQuaternion: obj.quaternion.clone(),
      authoredForwardLocal,
      forwardSource: noseEmpty ? ("nose-empty" as const) : ("local-+Z" as const),
      rangedRoots,
      groundedRoots,
      hasVariants,
    };
  }, [scene, config.objectName, config.pathGroup]);

  const { allRangeMode, setHasFlightVariants } = useSceneOptions();

  // Hide marker empties so they don't render.
  useEffect(() => {
    if (!data) return;
    for (const m of data.markerObjects) m.visible = false;
  }, [data]);

  // One-shot sanity log.
  useEffect(() => {
    if (!data) return;
    console.log(
      `[FlightPath:${config.objectName}] forward source: ${data.forwardSource}`,
      data.authoredForwardLocal.toArray().map((n) => n.toFixed(3)),
    );
  }, [data, config.objectName]);

  // Surface the variant toggle in the cog panel when any flying obj has variants.
  useEffect(() => {
    if (!data || !data.hasVariants) return;
    setHasFlightVariants(true);
    return () => setHasFlightVariants(false);
  }, [data, setHasFlightVariants]);

  // Toggle ranged vs grounded subtrees.
  useEffect(() => {
    if (!data || !data.hasVariants) return;
    const setSubtreeVisible = (root: THREE.Object3D, visible: boolean) => {
      root.traverse((o) => {
        o.visible = visible;
      });
    };
    for (const r of data.rangedRoots) setSubtreeVisible(r, allRangeMode);
    for (const r of data.groundedRoots) setSubtreeVisible(r, !allRangeMode);
  }, [data, allRangeMode]);

  const tRef = useRef(0);
  const pairIndexRef = useRef(0);
  const [debugNearTrigger, setDebugNearTrigger] = useState(false);
  const fwdArrowRef = useRef<THREE.ArrowHelper>(null);
  const pathArrowRef = useRef<THREE.ArrowHelper>(null);
  const arrowGroupRef = useRef<THREE.Group>(null);
  const headingQuatRef = useRef(new THREE.Quaternion());
  const alignQuatRef = useRef(new THREE.Quaternion());
  const rollQuatRef = useRef(new THREE.Quaternion());
  const tmpVecARef = useRef(new THREE.Vector3());
  const tmpVecBRef = useRef(new THREE.Vector3());
  const rollAngleRef = useRef(0);
  const rollingRef = useRef(false);
  const wasNearTriggerRef = useRef(false);
  const prevWorldPosRef = useRef(new THREE.Vector3());
  const nextWorldPosRef = useRef(new THREE.Vector3());
  const currentWorldPosRef = useRef(new THREE.Vector3());

  const localCorrection = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(config.pitchOffset ?? 0, 0, config.rollOffset ?? 0),
      ),
    [config.pitchOffset, config.rollOffset],
  );

  const applyPose = (
    pairIndex: number,
    t: number,
    worldPos?: THREE.Vector3,
  ) => {
    if (!data) return;
    const pair = data.pairs[pairIndex];
    const targetWorldPos =
      worldPos ??
      nextWorldPosRef.current.lerpVectors(pair.startPos, pair.endPos, t);

    if (data.obj.parent) {
      data.obj.position.copy(
        data.obj.parent.worldToLocal(targetWorldPos.clone()),
      );
    } else {
      data.obj.position.copy(targetWorldPos);
    }

    const authoredFwdWorld = tmpVecARef.current
      .copy(data.authoredForwardLocal)
      .applyQuaternion(data.baseQuaternion)
      .normalize();
    const pathDir = tmpVecBRef.current
      .copy(pair.endPos)
      .sub(pair.startPos)
      .normalize();
    alignQuatRef.current.setFromUnitVectors(authoredFwdWorld, pathDir);

    headingQuatRef.current.setFromAxisAngle(
      WORLD_UP,
      config.headingOffset ?? 0,
    );

    rollQuatRef.current.setFromAxisAngle(
      data.authoredForwardLocal,
      rollAngleRef.current,
    );
    data.obj.quaternion
      .copy(localCorrection)
      .multiply(rollQuatRef.current)
      .premultiply(data.baseQuaternion)
      .premultiply(alignQuatRef.current)
      .premultiply(headingQuatRef.current);
  };

  // Init / cleanup. tRef seeds with phaseOffset so squadrons stagger naturally.
  useEffect(() => {
    if (!data) return;

    const phase = THREE.MathUtils.euclideanModulo(config.phaseOffset ?? 0, 1);
    const totalCycles = data.pairs.length;
    const scaled = phase * totalCycles;
    pairIndexRef.current = Math.floor(scaled) % totalCycles;
    tRef.current = scaled - Math.floor(scaled);

    const startPair = data.pairs[pairIndexRef.current];
    const seedWorld = nextWorldPosRef.current.lerpVectors(
      startPair.startPos,
      startPair.endPos,
      tRef.current,
    );
    applyPose(pairIndexRef.current, tRef.current, seedWorld);
    data.obj.getWorldPosition(prevWorldPosRef.current);

    return () => {
      data.obj.position.copy(data.basePosition);
      data.obj.quaternion.copy(data.baseQuaternion);
    };
  }, [data, config.headingOffset, config.phaseOffset]);

  useFrame((_, delta) => {
    if (!data) return;
    const next = tRef.current + delta / config.duration;
    if (next >= 1) {
      pairIndexRef.current = (pairIndexRef.current + 1) % data.pairs.length;
    }
    tRef.current = next % 1;
    const t = tRef.current;
    const pair = data.pairs[pairIndexRef.current];
    const nextWorldPos = nextWorldPosRef.current.lerpVectors(
      pair.startPos,
      pair.endPos,
      t,
    );

    const radius = config.rollTriggerRadius ?? 4;
    const nearTrigger = data.rollTriggers.some(
      (p) =>
        distanceToSegment(p, prevWorldPosRef.current, nextWorldPos) < radius,
    );
    if (nearTrigger !== debugNearTrigger) {
      setDebugNearTrigger(nearTrigger);
    }
    if (nearTrigger && !wasNearTriggerRef.current && !rollingRef.current) {
      rollingRef.current = true;
      rollAngleRef.current = 0;
    }
    wasNearTriggerRef.current = nearTrigger;

    if (rollingRef.current) {
      const rollDuration = config.rollDuration ?? 0.6;
      rollAngleRef.current += (delta * Math.PI * 2) / rollDuration;
      if (rollAngleRef.current >= Math.PI * 2) {
        rollAngleRef.current = 0;
        rollingRef.current = false;
      }
    }

    applyPose(pairIndexRef.current, t, nextWorldPos);
    prevWorldPosRef.current.copy(nextWorldPos);

    let opacity: number;
    if (t < config.fadeIn) opacity = t / config.fadeIn;
    else if (t > 1 - config.fadeOut) opacity = (1 - t) / config.fadeOut;
    else opacity = 1;

    for (const mesh of data.meshes) {
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of mats) {
        (mat as THREE.Material).opacity = opacity;
      }
    }

    // Park the debug arrow group at the obj's current world position.
    if (arrowGroupRef.current) {
      data.obj.getWorldPosition(currentWorldPosRef.current);
      arrowGroupRef.current.position.copy(currentWorldPosRef.current);
    }
    if (fwdArrowRef.current) {
      const fwd = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(data.obj.quaternion)
        .normalize();
      fwdArrowRef.current.setDirection(fwd);
    }
    if (pathArrowRef.current) {
      const pdir = pair.endPos.clone().sub(pair.startPos).normalize();
      pathArrowRef.current.setDirection(pdir);
    }
  });

  if (!data) return null;
  if (!debugHitboxes) return null;

  return (
    <>
      {SHOW_BARREL_ROLL_TRIGGERS_WITH_DEBUG_HITBOXES &&
        data.rollTriggers.map((triggerPos, index) => (
          <mesh key={`roll-trigger-${index}`} position={triggerPos}>
            <sphereGeometry args={[config.rollTriggerRadius ?? 4, 16, 12]} />
            <meshBasicMaterial
              color={debugNearTrigger ? "#22c55e" : "#ff4d4f"}
              wireframe
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        ))}
      <group ref={arrowGroupRef}>
        {/* Yellow = current model forward, cyan = current path direction.
            With auto-alignment they should overlap. If they don't, drop a
            `<obj>_nose` empty in Blender at the tip of the nose. */}
        <arrowHelper
          ref={fwdArrowRef}
          args={[
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, 0),
            3,
            0xffff00,
          ]}
        />
        <arrowHelper
          ref={pathArrowRef}
          args={[
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, 0),
            3,
            0x00ffff,
          ]}
        />
      </group>
    </>
  );
}
