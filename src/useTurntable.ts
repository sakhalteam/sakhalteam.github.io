// useTurntable.ts

import { useEffect, useRef, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Slow auto-rotation turntable for 3D scenes.
 *
 * Rotates the camera around the orbit target at a gentle speed.
 * Pauses when the user interacts (mouse, keyboard, touch).
 * Auto-resumes after `idleTimeout` ms of no interaction.
 *
 * Returns `{ stop, playing }`:
 *   - `stop()` — pause turntable (called by keyboard hook etc.)
 *   - `playing` — whether turntable is currently rotating (for UI)
 *   - `toggle()` — flip play/pause manually
 */
export function useTurntable(
  orbitRef: React.RefObject<any>,
  {
    /** Rotation speed in radians per second. Default: ~2.4° per second */
    speed = 0.009,
    /** Direction: 1 = counter-clockwise (from above), -1 = clockwise */
    direction = -1,
    /** Ms of idle before auto-resuming rotation. Default: 15000 (15s). Set 0 to disable. */
    idleTimeout = 15000,
    /** If false, turntable is permanently off and toggle is a no-op. */
    enabled = true,
  } = {},
) {
  const active = useRef(enabled);
  const [playing, setPlaying] = useState(enabled);
  const lastInteraction = useRef(0);
  const manualPause = useRef(false);
  const { gl } = useThree();

  const stop = useCallback(() => {
    active.current = false;
    setPlaying(false);
    lastInteraction.current = performance.now();
  }, []);

  const toggle = useCallback(() => {
    if (!enabled) return;
    if (active.current) {
      // Currently playing → pause manually
      active.current = false;
      manualPause.current = true;
      setPlaying(false);
    } else {
      // Currently paused → resume
      active.current = true;
      manualPause.current = false;
      setPlaying(true);
    }
  }, []);

  // Stop on any mouse/touch/scroll interaction with the canvas
  useEffect(() => {
    const canvas = gl.domElement;

    const onInteract = () => {
      active.current = false;
      manualPause.current = false;
      setPlaying(false);
      lastInteraction.current = performance.now();
    };

    canvas.addEventListener("pointerdown", onInteract);
    canvas.addEventListener("wheel", onInteract);
    canvas.addEventListener("touchstart", onInteract);

    return () => {
      canvas.removeEventListener("pointerdown", onInteract);
      canvas.removeEventListener("wheel", onInteract);
      canvas.removeEventListener("touchstart", onInteract);
    };
  }, [gl]);

  useFrame(({ camera }, delta) => {
    if (!enabled) return;
    // Auto-resume after idle timeout (unless manually paused via toggle)
    if (!active.current && !manualPause.current && idleTimeout > 0) {
      const idle = performance.now() - lastInteraction.current;
      if (idle > idleTimeout && lastInteraction.current > 0) {
        active.current = true;
        setPlaying(true);
      }
    }

    if (!active.current) return;
    const controls = orbitRef.current;
    if (!controls) return;

    // Rotate camera position around the orbit target on the Y axis
    const offset = camera.position.clone().sub(controls.target);
    const angle = speed * direction * delta;
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    camera.position.copy(controls.target).add(offset);

    controls.update();
  });

  return { stop, toggle, playing };
}
