// FlightPath.tsx
//
// Animates a zone mesh along a straight line between two empty markers, with
// fade-in/out at the ends of each cycle. Also renders an invisible follower
// hitbox that handles clicks so the flying object is navigable.
//
// Blender-side contract (all siblings at the GLB scene root):
//   zone_<key>                                        the flying mesh (animated + clicked)
//   <zone_<key>>_flight_start[_NN]                    empty marking cycle-start position
//   <zone_<key>>_flight_end[_NN] | _flight_finish[_NN] empty marking cycle-end position
//   <any_prefix>_barrel_roll_trigger[_NN]             optional empty; arwing barrel-rolls when it enters its radius
//     (name the prefix anything you like — e.g. "starlight_" — as long as
//     it does NOT start with "zone_" or "portal_" or it'll get picked up
//     as a hotspot by the scanner.)
//
// Numbered suffixes (_01, _02, …) define multiple start/end pairs; each full
// cycle advances to the next pair (wrapping), so the mesh alternates paths.
// Start and end are paired by matching suffix. Unsuffixed is also valid.
//
// Example for Starlight Zone (object name = "zone_starlight_zone"):
//   zone_starlight_zone
//   zone_starlight_zone_flight_start_01
//   zone_starlight_zone_flight_finish_01
//   zone_starlight_zone_flight_start_02
//   zone_starlight_zone_flight_finish_02

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getZoneConfig } from "./sceneMap";
import { useSceneOptions } from "./SceneOptionsContext";
import { AdaptiveLabel } from "./AdaptiveLabel";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_X = new THREE.Vector3(1, 0, 0);

function distanceToSegment(
  point: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
) {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq === 0) return point.distanceTo(a);
  const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / lengthSq, 0, 1);
  return point.distanceTo(a.clone().addScaledVector(ab, t));
}

/**
 * Classify a descendant of the flying zone object into a variant group.
 * Anything containing `all_range_mode` in its name is the "ranged" variant;
 * anything containing `closed` or `feet` is the "grounded" variant. Names
 * that match neither are considered always-visible structural parts (body).
 */
function classifyVariant(name: string): "ranged" | "grounded" | null {
  const n = name.toLowerCase();
  if (n.includes("all_range_mode")) return "ranged";
  if (n.includes("_closed") || n.includes("_feet")) return "grounded";
  return null;
}

export interface FlightPathConfig {
  /** Object name of the flying zone, e.g. "zone_star_zone". */
  objectName: string;
  /** Seconds per full cycle (start → end). */
  duration: number;
  /** Fraction of cycle spent fading in at start. 0..0.5. */
  fadeIn: number;
  /** Fraction of cycle spent fading out at end. 0..0.5. */
  fadeOut: number;
  /** Extra yaw in radians applied in world-Y space (fixes heading). */
  headingOffset?: number;
  /** Local-space pitch correction in radians (rotates around model +X). */
  pitchOffset?: number;
  /** Local-space roll correction in radians (rotates around model +Z). */
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
  onNavigate,
  onComingSoon,
  onFocus,
  isFocused,
}: {
  scene: THREE.Object3D;
  config: FlightPathConfig;
  onNavigate: (url: string, internal: boolean) => void;
  onComingSoon: (label: string) => void;
  onFocus: (point: THREE.Vector3) => void;
  isFocused: (point: THREE.Vector3) => boolean;
}) {
  const data = useMemo(() => {
    const objLower = config.objectName.toLowerCase();
    const escaped = objLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startRe = new RegExp(`^${escaped}_flight_start(?:_(\\d+))?$`);
    const endRe = new RegExp(`^${escaped}_flight_(?:end|finish)(?:_(\\d+))?$`);
    // Any prefix ending in `_barrel_roll_trigger` (optionally numbered).
    // We don't tie this to the flying obj's name so users can pick a prefix
    // that won't collide with hotspot scanning (e.g. `starlight_`).
    const rollTriggerRe = /_barrel_roll_trigger(?:_\d+)?$/;

    let obj: THREE.Object3D | undefined;
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

    // Pair start/end empties by matching numeric suffix. Unsuffixed pairs use "".
    const keys = [...new Set([...startMap.keys(), ...endMap.keys()])].sort();
    const rawPairs: { startPos: THREE.Vector3; endPos: THREE.Vector3 }[] = [];
    for (const k of keys) {
      const s = startMap.get(k);
      const e = endMap.get(k);
      if (s && e) rawPairs.push({ startPos: s, endPos: e });
    }
    if (rawPairs.length === 0) return null;

    // Use pair 0 as the reference heading, then solve an absolute yaw for the
    // active pair each frame while preserving the authored pitch/roll.
    const yawOf = (a: THREE.Vector3, b: THREE.Vector3) =>
      Math.atan2(b.x - a.x, b.z - a.z);
    const baseYaw = yawOf(rawPairs[0].startPos, rawPairs[0].endPos);
    const pairs = rawPairs.map(({ startPos, endPos }) => ({
      startPos,
      endPos,
      yawOffset: yawOf(startPos, endPos) - baseYaw,
    }));

    // Collect all meshes + flip their materials into transparent mode.
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

    // Detect variant groups (ranged vs grounded). Record by top-level child
    // so we can toggle entire subtrees in one go.
    const rangedRoots: THREE.Object3D[] = [];
    const groundedRoots: THREE.Object3D[] = [];
    for (const child of obj.children) {
      const cls = classifyVariant(child.name);
      if (cls === "ranged") rangedRoots.push(child);
      else if (cls === "grounded") groundedRoots.push(child);
    }
    const hasVariants = rangedRoots.length > 0 || groundedRoots.length > 0;

    // Hitbox size from the flying object's initial bbox.
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    // Pad a bit so it's forgiving to click.
    size.multiplyScalar(1.3);

    return {
      obj,
      pairs,
      markerObjects,
      rollTriggers,
      meshes,
      basePosition: obj.position.clone(),
      baseQuaternion: obj.quaternion.clone(),
      hitSize: size,
      rangedRoots,
      groundedRoots,
      hasVariants,
    };
  }, [scene, config.objectName]);

  const { allRangeMode, setHasFlightVariants } = useSceneOptions();

  // Hide empty markers so they don't produce any visual artifacts.
  useEffect(() => {
    if (!data) return;
    for (const m of data.markerObjects) m.visible = false;
  }, [data]);

  // Register that this zone has flight variants so the cog panel shows the toggle.
  useEffect(() => {
    if (!data) return;
    if (!data.hasVariants) return;
    setHasFlightVariants(true);
    return () => setHasFlightVariants(false);
  }, [data, setHasFlightVariants]);

  // Apply variant visibility whenever the toggle flips.
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
  const followerRef = useRef<THREE.Group>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [debugNearTrigger, setDebugNearTrigger] = useState(false);
  const yawQuatRef = useRef(new THREE.Quaternion());
  const rollQuatRef = useRef(new THREE.Quaternion());
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

  const applyPose = (pairIndex: number, t: number, worldPos?: THREE.Vector3) => {
    if (!data) return;
    const pair = data.pairs[pairIndex];
    const targetWorldPos =
      worldPos ?? nextWorldPosRef.current.lerpVectors(pair.startPos, pair.endPos, t);

    if (data.obj.parent) {
      data.obj.position.copy(data.obj.parent.worldToLocal(targetWorldPos.clone()));
    } else {
      data.obj.position.copy(targetWorldPos);
    }

    yawQuatRef.current.setFromAxisAngle(
      WORLD_UP,
      pair.yawOffset + (config.headingOffset ?? 0),
    );
    rollQuatRef.current.setFromAxisAngle(LOCAL_X, rollAngleRef.current);
    data.obj.quaternion
      .copy(localCorrection)
      .multiply(rollQuatRef.current)
      .premultiply(data.baseQuaternion)
      .premultiply(yawQuatRef.current);
  };

  useEffect(() => {
    if (!data) return;

    tRef.current = 0;
    pairIndexRef.current = 0;
    applyPose(0, 0, data.pairs[0].startPos);
    data.obj.getWorldPosition(prevWorldPosRef.current);

    if (followerRef.current) {
      followerRef.current.position.copy(prevWorldPosRef.current);
    }
    if (hitboxRef.current) {
      hitboxRef.current.visible = false;
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = "0";
    }

    return () => {
      data.obj.position.copy(data.basePosition);
      data.obj.quaternion.copy(data.baseQuaternion);
    };
  }, [data, config.headingOffset]);

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

    // Barrel-roll proximity check — edge-triggered so the arwing rolls once
    // per approach, not continuously while inside the trigger radius.
    const radius = config.rollTriggerRadius ?? 4;
    const nearTrigger = data.rollTriggers.some(
      (p) => distanceToSegment(p, prevWorldPosRef.current, nextWorldPos) < radius,
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

    if (followerRef.current) {
      data.obj.getWorldPosition(currentWorldPosRef.current);
      followerRef.current.position.copy(currentWorldPosRef.current);
    }
    if (hitboxRef.current) {
      // Only clickable when mostly visible — avoids phantom clicks during fade.
      hitboxRef.current.visible = opacity > 0.6;
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = String(opacity);
    }
  });

  if (!data) return null;
  const cfg = getZoneConfig(config.objectName);

  return (
    <>
      {/* Debug visualisation for barrel-roll trigger radii. Uncomment to see
          the red/green wireframe spheres at each `*_barrel_roll_trigger` empty
          — handy for positioning triggers or diagnosing collision issues. */}
      {/* {data.rollTriggers.map((triggerPos, index) => (
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
      ))} */}
      <group ref={followerRef}>
      <mesh
        ref={hitboxRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          const point = data.obj.position.clone();
          if (!isFocused(point)) {
            onFocus(point);
            return;
          }
          if (cfg.url) onNavigate(cfg.url, cfg.internal);
          else onComingSoon(cfg.label);
        }}
      >
        <boxGeometry args={[data.hitSize.x, data.hitSize.y, data.hitSize.z]} />
        <meshStandardMaterial visible={false} />
      </mesh>
      <AdaptiveLabel
        position={[0, data.hitSize.y / 2 + 0.4, 0]}
        nearDistance={5}
        farDistance={60}
      >
        <div
          ref={labelRef}
          style={{
            background: hovered ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.75)",
            color: hovered
              ? cfg.url
                ? "#ff8a6a"
                : "#7dd3fc"
              : cfg.url
                ? "#e05a3a"
                : "#9ca3af",
            padding: hovered ? "4px 14px" : "3px 10px",
            borderRadius: "99px",
            fontSize: hovered ? "14px" : "12px",
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            border: `1px solid ${
              hovered
                ? cfg.url
                  ? "rgba(224,90,58,0.8)"
                  : "rgba(125,211,252,0.5)"
                : "rgba(255,255,255,0.1)"
            }`,
            boxShadow: hovered
              ? `0 0 12px ${cfg.url ? "rgba(224,90,58,0.5)" : "rgba(125,211,252,0.3)"}`
              : "none",
            transition: "all 0.15s ease",
            pointerEvents: "none",
          }}
        >
          {cfg.label}
        </div>
      </AdaptiveLabel>
      </group>
    </>
  );
}
