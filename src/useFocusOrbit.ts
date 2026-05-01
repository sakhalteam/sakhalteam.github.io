// useFocusOrbit.ts
//
// Eased tween of an OrbitControls target — the animated version of Blender's
// `.` focus. On each call, we tween the pivot to the clicked point AND pull
// the camera to a sensible viewing distance derived from the object's size,
// keeping the user's current look-direction. This gives predictable framing
// no matter how zoomed out the user was when they clicked.
//
// Returns a stable `focus(point, id?, radius?)` callback to drop into any
// onPointerDown / click handler.
//
// A new focus call cancels the in-flight tween. Knobs are mostly per-call
// (radius) or per-hook (duration).

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";

interface Options {
  /** Tween duration in ms. Default: 350. */
  duration?: number;
  /**
   * World-space distance from a click point to the most-recently focused
   * target within which we consider the point "already focused" — so the
   * second click on the same object fires the real action instead of
   * re-running the focus tween. Default: 1.5.
   */
  focusedThreshold?: number;
  /**
   * How far past the ideal distance the camera can be before `isFocused`
   * returns false. Being closer than the ideal still counts as focused; if
   * the user has manually zoomed out past this, the next click re-fits
   * instead of firing the action. Default: 3.
   */
  distanceTolerance?: number;
  /**
   * Multiplier applied to an object's bbox radius to choose viewing
   * distance. Higher = pulls back further; lower = closer-up. Default: 4.
   */
  distanceMultiplier?: number;
  /** Minimum viewing distance after the fit, so very small toys don't shove
   *  the camera inside them. Default: 4. */
  minDistance?: number;
}

export function useFocusOrbit(
  orbitRef: React.RefObject<any>,
  {
    duration = 1050,
    focusedThreshold = 1.5,
    distanceTolerance = 3,
    distanceMultiplier = 4.5,
    minDistance = 2,
  }: Options = {},
) {
  const tweenRef = useRef<number | null>(null);
  // Last thing we focused on. `isFocused` compares against this.
  //   - point:  where we aimed the tween.
  //   - id:     optional stable identity (e.g. hotspot key). When provided,
  //             isFocused matches by id alone — needed for moving targets
  //             like flight-pathed zones whose position changes every frame.
  //   - idealDistance: the camera-to-target distance we tweened toward. If
  //             the user zooms out past it, isFocused goes false so the
  //             next click re-fits instead of firing the action. Being
  //             closer still counts as focused, so dragging from a focused
  //             object doesn't snap the camera back out.
  const lastFocusedRef = useRef<{
    point: THREE.Vector3;
    id: string | null;
    idealDistance: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (tweenRef.current !== null) {
        cancelAnimationFrame(tweenRef.current);
        tweenRef.current = null;
      }
    };
  }, []);

  const focus = useCallback(
    (
      point: THREE.Vector3,
      id?: string,
      radius?: number,
      opts?: { distance?: number; behavior?: "fit" | "instant" },
    ) => {
      const controls = orbitRef.current;
      if (!controls) return;
      const camera = controls.object as THREE.Camera | undefined;
      if (!camera) return;

      // "instant" behavior: skip the tween entirely. Mark this thing as
      // focused so the very next click fires the action. Used for moving
      // targets like flight zones where chasing the focus point makes the
      // object leave the frame anyway.
      if (opts?.behavior === "instant") {
        const currentDist = camera.position.distanceTo(controls.target);
        lastFocusedRef.current = {
          point: point.clone(),
          id: id ?? null,
          // Use current distance as the "ideal" so isFocused reads true at
          // the user's current zoom (no re-fit gate kicks in).
          idealDistance: currentDist,
        };
        return;
      }

      // Compute ideal camera distance for this click.
      // Priority: explicit per-call distance → bbox-derived → keep current.
      const currentDist = camera.position.distanceTo(controls.target);
      const idealDistance =
        opts?.distance !== undefined
          ? opts.distance
          : radius !== undefined
            ? Math.max(minDistance, radius * distanceMultiplier)
            : currentDist;

      // Short-circuit: already focused on this thing AND at roughly the
      // right/further-in distance — don't restart the tween. Prevents camera jitter on
      // rapid re-clicks of the same object (which was causing the click-
      // phase raycast to miss small toys). If the user has zoomed out
      // past tolerance, we DO re-tween, so they're never stuck far away.
      const last = lastFocusedRef.current;
      const identityMatch =
        last &&
        (id !== undefined
          ? last.id === id
          : last.point.distanceTo(point) < focusedThreshold);
      if (identityMatch) {
        const zoomedOutPastTolerance =
          currentDist - last!.idealDistance > distanceTolerance;
        if (!zoomedOutPastTolerance) return;
      }

      if (tweenRef.current !== null) {
        cancelAnimationFrame(tweenRef.current);
      }

      const fromTarget = controls.target.clone();
      const toTarget = point.clone();
      // Direction FROM target TO camera — preserves current viewing angle.
      // If camera and target coincide (shouldn't happen, but defensively)
      // fall back to a gentle downward angle.
      const dir = camera.position.clone().sub(fromTarget);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 3);
      dir.normalize();
      const fromCam = camera.position.clone();
      const toCam = toTarget.clone().add(dir.multiplyScalar(idealDistance));

      lastFocusedRef.current = {
        point: toTarget.clone(),
        id: id ?? null,
        idealDistance,
      };

      const start = performance.now();
      const tmpT = new THREE.Vector3();
      const tmpC = new THREE.Vector3();

      const tick = () => {
        const progress = Math.min((performance.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        tmpT.lerpVectors(fromTarget, toTarget, eased);
        tmpC.lerpVectors(fromCam, toCam, eased);
        controls.target.copy(tmpT);
        camera.position.copy(tmpC);
        controls.update();
        if (progress < 1) {
          tweenRef.current = requestAnimationFrame(tick);
        } else {
          tweenRef.current = null;
        }
      };
      tweenRef.current = requestAnimationFrame(tick);
    },
    [
      orbitRef,
      duration,
      focusedThreshold,
      distanceTolerance,
      distanceMultiplier,
      minDistance,
    ],
  );

  const isFocused = useCallback(
    (point: THREE.Vector3, id?: string) => {
      const controls = orbitRef.current;
      const last = lastFocusedRef.current;
      if (!controls || !last) return false;
      const camera = controls.object as THREE.Camera | undefined;
      if (!camera) return false;

      const identityMatch =
        id !== undefined
          ? last.id === id
          : last.point.distanceTo(point) < focusedThreshold;
      if (!identityMatch) return false;

      // Also require we're not too far beyond the focused distance; zooming
      // out past tolerance forces the next click to re-fit. Being closer
      // than ideal still counts as focused, which lets users start an orbit
      // drag on the focused object without triggering a zoom-back-out tween.
      const currentDist = camera.position.distanceTo(controls.target);
      return currentDist - last.idealDistance <= distanceTolerance;
    },
    [focusedThreshold, distanceTolerance],
  );

  return { focus, isFocused };
}
