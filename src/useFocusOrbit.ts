// useFocusOrbit.ts
//
// Eased tween of an OrbitControls target (with the camera riding alongside so
// zoom/angle are preserved) — the animated version of Blender's `.` focus.
// Returns a stable `focus(point)` callback to drop into any onPointerDown /
// click handler.
//
// A new focus call cancels the in-flight tween. The only knob is the
// duration; change it per-scene if you want a snappier or more cinematic
// feel (350ms is the current Blender-ish default).

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";

interface Options {
  /** Tween duration in ms. Default: 350. */
  duration?: number;
  /**
   * World-space distance from the camera to a point within which we skip the
   * focus tween and treat clicks as immediate interactions. Clicks on far-away
   * objects focus first; clicks on nearby objects act normally. Default: 18.
   */
  focusedThreshold?: number;
}

export function useFocusOrbit(
  orbitRef: React.RefObject<any>,
  { duration = 350, focusedThreshold = 18 }: Options = {},
) {
  const tweenRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tweenRef.current !== null) {
        cancelAnimationFrame(tweenRef.current);
        tweenRef.current = null;
      }
    };
  }, []);

  const focus = useCallback(
    (point: THREE.Vector3) => {
      const controls = orbitRef.current;
      if (!controls) return;
      const camera = controls.object as THREE.Camera | undefined;
      if (!camera) return;

      if (tweenRef.current !== null) {
        cancelAnimationFrame(tweenRef.current);
      }

      const fromTarget = controls.target.clone();
      const toTarget = point.clone();
      const camOffset = camera.position.clone().sub(fromTarget);
      const start = performance.now();
      const tmp = new THREE.Vector3();

      const tick = () => {
        const progress = Math.min((performance.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        tmp.lerpVectors(fromTarget, toTarget, eased);
        controls.target.copy(tmp);
        camera.position.copy(tmp).add(camOffset);
        controls.update();
        if (progress < 1) {
          tweenRef.current = requestAnimationFrame(tick);
        } else {
          tweenRef.current = null;
        }
      };
      tweenRef.current = requestAnimationFrame(tick);
    },
    [orbitRef, duration],
  );

  const isFocused = useCallback(
    (point: THREE.Vector3) => {
      const controls = orbitRef.current;
      if (!controls) return false;
      const camera = controls.object as THREE.Camera | undefined;
      if (!camera) return false;
      return camera.position.distanceTo(point) < focusedThreshold;
    },
    [orbitRef, focusedThreshold],
  );

  return { focus, isFocused };
}
