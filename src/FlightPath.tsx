// FlightPath.tsx
//
// Animates a zone mesh along a straight line between two empty markers, with
// fade-in/out at the ends of each cycle. Also renders an invisible follower
// hitbox that handles clicks so the flying object is navigable.
//
// Blender-side contract (all siblings at the GLB scene root):
//   zone_<key>                               the flying mesh (animated + clicked)
//   <zone_<key>>_flight_start                 empty marking cycle-start position
//   <zone_<key>>_flight_end | _flight_finish  empty marking cycle-end position
//
// Example for Starlight Zone (object name = "zone_starlight_zone"):
//   zone_starlight_zone
//   zone_starlight_zone_flight_start
//   zone_starlight_zone_flight_finish   (or _flight_end)

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getZoneConfig } from "./sceneMap";
import { useSceneOptions } from "./SceneOptionsContext";
import { AdaptiveLabel } from "./AdaptiveLabel";

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
}

export default function FlightPath({
  scene,
  config,
  onNavigate,
  onComingSoon,
}: {
  scene: THREE.Object3D;
  config: FlightPathConfig;
  onNavigate: (url: string, internal: boolean) => void;
  onComingSoon: (label: string) => void;
}) {
  const data = useMemo(() => {
    const objLower = config.objectName.toLowerCase();
    const startLower = `${objLower}_flight_start`;
    const endLowers = [`${objLower}_flight_end`, `${objLower}_flight_finish`];

    let obj: THREE.Object3D | undefined;
    let start: THREE.Object3D | undefined;
    let end: THREE.Object3D | undefined;
    scene.traverse((o) => {
      const n = o.name.toLowerCase();
      if (n === objLower) obj = o;
      else if (n === startLower) start = o;
      else if (endLowers.includes(n)) end = o;
    });

    if (!obj || !start || !end) return null;

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
      startPos: start.position.clone(),
      endPos: end.position.clone(),
      meshes,
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
    const base = config.objectName.toLowerCase();
    const markers = new Set([
      `${base}_flight_start`,
      `${base}_flight_end`,
      `${base}_flight_finish`,
    ]);
    scene.traverse((o) => {
      if (markers.has(o.name.toLowerCase())) o.visible = false;
    });
  }, [scene, data, config.objectName]);

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
  const followerRef = useRef<THREE.Group>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!data) return;
    tRef.current = (tRef.current + delta / config.duration) % 1;
    const t = tRef.current;

    data.obj.position.lerpVectors(data.startPos, data.endPos, t);

    let opacity: number;
    if (t < config.fadeIn) opacity = t / config.fadeIn;
    else if (t > 1 - config.fadeOut) opacity = (1 - t) / config.fadeOut;
    else opacity = 1;

    for (const mesh of data.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        (mat as THREE.Material).opacity = opacity;
      }
    }

    if (followerRef.current) {
      followerRef.current.position.copy(data.obj.position);
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
        onClick={(e) => {
          e.stopPropagation();
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
  );
}
