// LadderPortalIndicator.tsx
//
// Cloud Town: a Mariokart-boost-style chevron stack that hovers above the
// `ct_toy_ladder` mesh, plus a "look up..." toast that fades in on hover.
// Clicking the ladder shortcuts the camera to the dream_zone hotspot's
// fitted framing — same call useFocusOrbit would make if the user clicked
// dream_zone directly.
//
// The chevron and toast track the ladder's world position every frame, so
// re-arranging cloud_town in Blender (and re-exporting the GLB) doesn't
// require any code change here.

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useDebugHitboxes } from "./debugFlags";

const LADDER_NAME = "ct_toy_ladder";
const CHEVRON_COLOR = "#7dd3fc";
// World-units above the ladder's bbox BOTTOM where the chevron stack centers.
// We anchor at the bottom (where Pool Time is) rather than the top (Dream
// Zone) so the indicator is visible when looking up *from* Pool Time.
const CHEVRON_LIFT = 1.2;
// Spacing between the two chevrons (lower then upper).
const CHEVRON_GAP = 0.55;
// Bob amplitude/period for the chevron stack.
const BOB_AMP = 0.18;
const BOB_PERIOD = 1.6;
// Toast offset above the chevron stack.
const TOAST_LIFT_ABOVE_CHEVRONS = 0.85;
// Art-directed nudge from the ladder bbox center for the chevron itself.
const CHEVRON_OFFSET = new THREE.Vector3(-0.75, 0, 0.35);
// Padding multiplier on the ladder bbox for the click/hover proxy. Hovering
// anywhere along the ladder triggers the outline + toast.
const PROXY_PADDING = 1.15;

// Shape for one upward chevron arrow. Built once, reused for both meshes.
const CHEVRON_SHAPE = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.15);
  shape.lineTo(0, 0.25);
  shape.lineTo(0.5, -0.15);
  shape.lineTo(0.32, -0.15);
  shape.lineTo(0, 0.07);
  shape.lineTo(-0.32, -0.15);
  shape.closePath();
  return shape;
})();

export default function LadderPortalIndicator({
  scene,
  onActivate,
  onHoverChange,
}: {
  scene: THREE.Object3D;
  /** Called when the user clicks the ladder. Wire this to focus the
   *  dream_zone hotspot. */
  onActivate: () => void;
  /** Called when the user hovers the ladder proxy. Same signature as
   *  ToyInteractor's onHoverChange so the outline pipeline lights up the
   *  ladder mesh on hover (since the ladder is `quiet: true` in sceneMap
   *  and otherwise wouldn't emit a toy outline). */
  onHoverChange?: (objects: THREE.Object3D[], hovered: boolean) => void;
}) {
  // Find the ladder once. If it isn't present in this zone's GLB, render
  // nothing (cheap inert no-op).
  const ladder = useMemo(() => {
    let found: THREE.Object3D | null = null;
    scene.traverse((o) => {
      if (!found && o.name?.toLowerCase().replace(/\.\d+$/, "") === LADDER_NAME)
        found = o;
    });
    return found as THREE.Object3D | null;
  }, [scene]);

  const groupRef = useRef<THREE.Group>(null);
  const lowerChevronRef = useRef<THREE.Mesh>(null);
  const upperChevronRef = useRef<THREE.Mesh>(null);
  const proxyRef = useRef<THREE.Mesh>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  const toastOpacityRef = useRef(0);
  const [hovered, setHovered] = useState(false);
  const debugHitboxes = useDebugHitboxes();
  hoveredRef.current = hovered;

  // Reusable scratch objects (no allocation per frame).
  const tmpBox = useMemo(() => new THREE.Box3(), []);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);

  // Select the ladder root for OutlinePass. The root is the named GLB object,
  // and OutlinePass traverses selected objects internally, so this works
  // whether Blender exports it as a Mesh today or a Group later.
  const ladderOutlineObjects = useMemo(
    () => (ladder ? [ladder] : ([] as THREE.Object3D[])),
    [ladder],
  );

  // Initial proxy size from the ladder's bbox + a forgiving padding. The
  // proxy mesh itself is repositioned each frame in useFrame so it tracks
  // any motion, but the geometry (size) is sampled once at mount.
  const proxySize = useMemo(() => {
    if (!ladder) return null;
    const box = new THREE.Box3().setFromObject(ladder);
    const size = new THREE.Vector3();
    box.getSize(size);
    return size.multiplyScalar(PROXY_PADDING);
  }, [ladder]);

  useFrame(({ camera }, dt) => {
    if (!ladder) return;

    // Sample ladder world-bbox each frame so the indicator + proxy track any
    // Blender re-positioning + ancestor idle motion.
    tmpBox.setFromObject(ladder);

    // Chevron stack rides above the ladder's bbox top with a sine bob.
    if (groupRef.current) {
      tmpBox.getCenter(tmpVec);
      const t = performance.now() / 1000;
      const bob = Math.sin((t / BOB_PERIOD) * Math.PI * 2) * BOB_AMP;
      groupRef.current.position.set(
        tmpVec.x + CHEVRON_OFFSET.x,
        tmpBox.min.y + CHEVRON_LIFT + CHEVRON_OFFSET.y + bob,
        tmpVec.z + CHEVRON_OFFSET.z,
      );
      groupRef.current.lookAt(camera.position);
    }

    // Click/hover proxy covers the full ladder so hovering anywhere along
    // it triggers the outline + toast.
    if (proxyRef.current) {
      tmpBox.getCenter(tmpVec);
      proxyRef.current.position.copy(tmpVec);
    }

    // Staggered alpha pulse on the two chevrons (Mariokart-boost feel).
    const t = performance.now() / 1000;
    const pulse = (offset: number) =>
      0.5 + 0.5 * (0.5 + 0.5 * Math.sin((t + offset) * 4));
    if (lowerChevronRef.current) {
      const mat = lowerChevronRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = pulse(0);
    }
    if (upperChevronRef.current) {
      const mat = upperChevronRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = pulse(0.3);
    }

    // Toast fade in/out on hover state.
    const target = hoveredRef.current ? 1 : 0;
    const next = THREE.MathUtils.damp(
      toastOpacityRef.current,
      target,
      8,
      Math.min(dt, 0.05),
    );
    if (Math.abs(next - toastOpacityRef.current) > 0.001) {
      toastOpacityRef.current = next;
      if (toastRef.current) toastRef.current.style.opacity = String(next);
    }

    // Keep the outline channel asserted while hovered. The ladder sits near
    // other hotspot proxies, so a separate pointer-out can clear the shared
    // outline state after our pointer-over fires.
    if (hoveredRef.current) onHoverChange?.(ladderOutlineObjects, true);
  });

  // Cursor: pointer when hovered.
  useEffect(() => {
    if (hovered) document.body.style.cursor = "pointer";
    return () => {
      if (hovered) document.body.style.cursor = "auto";
    };
  }, [hovered]);

  if (!ladder || !proxySize) return null;

  return (
    <>
      {/* Glowing chevron pair, persistent. */}
      <group ref={groupRef}>
        <mesh ref={lowerChevronRef} position={[0, -CHEVRON_GAP / 2, 0]}>
          <shapeGeometry args={[CHEVRON_SHAPE]} />
          <meshBasicMaterial
            color={CHEVRON_COLOR}
            transparent
            opacity={0.7}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={upperChevronRef} position={[0, CHEVRON_GAP / 2, 0]}>
          <shapeGeometry args={[CHEVRON_SHAPE]} />
          <meshBasicMaterial
            color={CHEVRON_COLOR}
            transparent
            opacity={0.7}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>

        {/* "look up..." toast — background-less, floats above the chevrons.
            Opacity is driven by the useFrame damp above. */}
        <Html
          center
          position={[0, TOAST_LIFT_ABOVE_CHEVRONS, 0]}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            ref={toastRef}
            style={{
              opacity: 0,
              color: CHEVRON_COLOR,
              fontSize: "0.78rem",
              letterSpacing: "0.16em",
              whiteSpace: "nowrap",
              textShadow: "0 1px 6px rgba(0,0,0,0.7)",
            }}
          >
            look up...
          </div>
        </Html>
      </group>

      {/* Invisible click/hover proxy that follows the ladder. */}
      <mesh
        ref={proxyRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange?.(ladderOutlineObjects, true);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHoverChange?.([], false);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
      >
        <boxGeometry args={[proxySize.x, proxySize.y, proxySize.z]} />
        <meshBasicMaterial
          color="#7dd3fc"
          wireframe={debugHitboxes}
          transparent
          opacity={debugHitboxes ? 0.6 : 0}
          depthWrite={false}
          colorWrite={debugHitboxes}
        />
      </mesh>
    </>
  );
}
