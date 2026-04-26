// Module-scope pub/sub: the active scene's CameraRig registers a "reset to
// initial framing" callback; the DebugToggle ? menu calls it.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const RESET_SECONDS = 0.7;

let current: (() => void) | null = null;
const listeners = new Set<(canReset: boolean) => void>();

export function registerCameraReset(fn: (() => void) | null) {
  current = fn;
  for (const l of listeners) l(fn != null);
}

export function triggerCameraReset() {
  current?.();
}

export function useCameraReset(
  orbitRef: React.RefObject<any>,
  ready: boolean,
) {
  const { camera } = useThree();
  const initial = useRef<{
    camPos: THREE.Vector3;
    orbTarget: THREE.Vector3;
  } | null>(null);
  const tween = useRef<{
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    elapsed: number;
  } | null>(null);

  // Snapshot the initial pose once the scene has finished its auto-fit, then
  // expose a reset callback that lerps the camera back to that pose.
  useEffect(() => {
    if (!ready) return;
    // Defer one tick so OrbitControls has updated its target after auto-fit.
    const id = window.setTimeout(() => {
      if (!orbitRef.current) return;
      initial.current = {
        camPos: camera.position.clone(),
        orbTarget: orbitRef.current.target.clone(),
      };
      registerCameraReset(() => {
        if (!initial.current || !orbitRef.current) return;
        tween.current = {
          fromPos: camera.position.clone(),
          fromTarget: orbitRef.current.target.clone(),
          elapsed: 0,
        };
      });
    }, 0);
    return () => {
      window.clearTimeout(id);
      registerCameraReset(null);
    };
  }, [ready, camera, orbitRef]);

  useFrame((_, delta) => {
    const t = tween.current;
    const init = initial.current;
    if (!t || !init || !orbitRef.current) return;
    t.elapsed += delta;
    const k = Math.min(t.elapsed / RESET_SECONDS, 1);
    const eased = 1 - Math.pow(1 - k, 2);
    camera.position.lerpVectors(t.fromPos, init.camPos, eased);
    orbitRef.current.target.lerpVectors(t.fromTarget, init.orbTarget, eased);
    orbitRef.current.update();
    if (k >= 1) tween.current = null;
  });
}
