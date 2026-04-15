// useKeyboardControls.ts

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Keyboard camera controls for trackpad-friendly 3D navigation.
 *
 * WASD  — pan (move camera + target together)
 * Q / E — orbit left / right
 * R / F — zoom in / out
 * Z / X — move up / down
 * Shift — 2x speed
 *
 * Only active when the canvas is hovered, so typing elsewhere is unaffected.
 */
export function useKeyboardControls(
  orbitRef: React.RefObject<any>,
  {
    panSpeed = 0.15,
    orbitSpeed = 0.03,
    zoomSpeed = 0.3,
    onInteract,
  }: {
    panSpeed?: number;
    orbitSpeed?: number;
    zoomSpeed?: number;
    onInteract?: () => void;
  } = {},
) {
  const keys = useRef<Set<string>>(new Set());
  const canvasHovered = useRef(false);
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseEnter = () => {
      canvasHovered.current = true;
    };
    const onMouseLeave = () => {
      canvasHovered.current = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!canvasHovered.current) return;
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "r", "f", "z", "x"].includes(key)) {
        e.preventDefault();
        keys.current.add(key);
        onInteract?.();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key.toLowerCase());
    };

    // Blur clears all keys so we don't get "stuck" keys
    const onBlur = () => {
      keys.current.clear();
    };

    canvas.addEventListener("mouseenter", onMouseEnter);
    canvas.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      canvas.removeEventListener("mouseenter", onMouseEnter);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [gl]);

  const _panVec = useRef(new THREE.Vector3());
  const _right = useRef(new THREE.Vector3());
  const _forward = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    if (keys.current.size === 0) return;
    const controls = orbitRef.current;
    if (!controls) return;

    const shift = keys.current.has("shift") ? 2 : 1;
    const ps = panSpeed * shift;
    const os = orbitSpeed * shift;
    const zs = zoomSpeed * shift;

    // Build camera-relative right and forward (projected onto XZ plane)
    _right.current.setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
    _forward.current.setFromMatrixColumn(camera.matrix, 2).setY(0).normalize();

    const pan = _panVec.current.set(0, 0, 0);

    // WASD — pan
    if (keys.current.has("a"))
      pan.add(_right.current.clone().multiplyScalar(-ps));
    if (keys.current.has("d"))
      pan.add(_right.current.clone().multiplyScalar(ps));
    if (keys.current.has("w"))
      pan.add(_forward.current.clone().multiplyScalar(-ps));
    if (keys.current.has("s"))
      pan.add(_forward.current.clone().multiplyScalar(ps));

    if (pan.lengthSq() > 0) {
      camera.position.add(pan);
      controls.target.add(pan);
    }

    // Q / E — orbit (rotate azimuth)
    if (keys.current.has("q")) {
      const angle = os;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
    }
    if (keys.current.has("e")) {
      const angle = -os;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
    }

    // R / F — zoom (dolly along camera direction)
    if (keys.current.has("r")) {
      const dir = controls.target.clone().sub(camera.position).normalize();
      camera.position.addScaledVector(dir, zs);
    }
    if (keys.current.has("f")) {
      const dir = controls.target.clone().sub(camera.position).normalize();
      camera.position.addScaledVector(dir, -zs);
    }

    // Z / X — move up / down
    if (keys.current.has("z")) {
      camera.position.y += ps;
      controls.target.y += ps;
    }
    if (keys.current.has("x")) {
      camera.position.y -= ps;
      controls.target.y -= ps;
    }

    controls.update();
  });
}
