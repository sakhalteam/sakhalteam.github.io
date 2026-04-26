// useAutoFitCamera.ts

import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";

/**
 * Automatically positions the camera to frame the entire scene nicely.
 *
 * Computes the bounding box of the loaded scene, then intelligently picks
 * an elevation angle based on the model's shape:
 *   - Tall objects (towers): lower elevation so you see the front face
 *   - Flat/wide objects (islands, rooms): higher elevation for an isometric feel
 *   - Roughly cubic: a nice 3/4 view
 *
 * Also adds a slight azimuth offset so you never get a dead-on frontal view —
 * the camera is always slightly rotated for that 3/4 perspective feel.
 *
 * Optional Blender-authored empties (by suffix, any prefix is fine):
 *   *_camera_target (or *_scene_center) — overrides the bbox center as the
 *     lookAt point + orbit pivot.
 *   *_camera_start — overrides the computed camera position. Orientation is
 *     derived by looking at the target, so the empty's rotation is irrelevant.
 */
export function useAutoFitCamera(
  scene: THREE.Object3D | null,
  orbitRef: React.RefObject<any>,
  {
    /** Extra breathing room around the model (1.0 = tight fit, 1.4 = comfortable) */
    padding = 1.3,
    /** Override elevation angle in radians. If null, auto-detect from shape. */
    elevation: elevationOverride = null as number | null,
    /** Azimuth offset in radians (rotates camera around Y axis). Default: slight 3/4 angle */
    azimuth = 0.4,
    /** OrbitControls min zoom distance as a multiplier of model radius */
    minZoomMultiplier = 0.08,
    /** OrbitControls max zoom distance as a multiplier of model radius */
    maxZoomMultiplier = 7,
  } = {},
) {
  const { camera } = useThree();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!scene) return;

    // Exclude flight-animated zones + their marker empties from the fit bbox.
    // Those sit far outside the actual playable scene and would blow out zoom.
    const flightStartRe = /_flight_start(?:_\d+)?$/;
    const flightMarkerRe = /_flight_(?:start|end|finish)(?:_\d+)?$/;
    const flightedRoots = new Set<THREE.Object3D>();
    scene.traverse((obj) => {
      const lower = obj.name.toLowerCase();
      const match = lower.match(flightStartRe);
      if (!match) return;
      const targetName = lower.slice(0, match.index ?? 0);
      scene.traverse((o) => {
        if (o.name.toLowerCase() === targetName) flightedRoots.add(o);
      });
    });
    const isFlightMarker = (name: string) => {
      return flightMarkerRe.test(name.toLowerCase());
    };
    const isUnderFlightedRoot = (obj: THREE.Object3D) => {
      let p: THREE.Object3D | null = obj;
      while (p) {
        if (flightedRoots.has(p)) return true;
        p = p.parent;
      }
      return false;
    };

    // Optional Blender-authored camera overrides. Suffix match so the prefix
    // can be a zone key, zone abbreviation, or anything else.
    const targetRe = /_(?:camera_target|scene_center)$/;
    const startRe = /_camera_start$/;
    let targetEmpty: THREE.Object3D | null = null;
    let startEmpty: THREE.Object3D | null = null;
    scene.traverse((o) => {
      const lower = o.name.toLowerCase();
      if (!targetEmpty && targetRe.test(lower)) {
        targetEmpty = o;
        o.visible = false;
      }
      if (!startEmpty && startRe.test(lower)) {
        startEmpty = o;
        o.visible = false;
      }
    });

    const box = new THREE.Box3();
    scene.updateWorldMatrix(true, true);
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (isFlightMarker(obj.name)) return;
      if (isUnderFlightedRoot(obj)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const meshBox = mesh.geometry.boundingBox!.clone();
      meshBox.applyMatrix4(mesh.matrixWorld);
      box.union(meshBox);
    });
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    if (targetEmpty) {
      (targetEmpty as THREE.Object3D).getWorldPosition(center);
    }

    const size = new THREE.Vector3();
    box.getSize(size);

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = sphere.radius;
    const minDistance = Math.max(radius * minZoomMultiplier, 0.25);
    const maxDistance = Math.max(radius * maxZoomMultiplier, minDistance + 10);

    // Auto-detect elevation from bounding box aspect ratio
    let elevation: number;
    if (elevationOverride !== null) {
      elevation = elevationOverride;
    } else {
      const horizontalExtent = Math.max(size.x, size.z);
      const heightRatio = size.y / horizontalExtent;

      if (heightRatio > 2.0) {
        // Very tall (e.g. tower): look mostly straight at it
        elevation = 0.3;
      } else if (heightRatio > 1.0) {
        // Tallish: moderate angle
        elevation = 0.45;
      } else if (heightRatio < 0.15) {
        // Extremely flat (e.g. a floor plane): slightly higher isometric
        elevation = 0.65;
      } else {
        // Everything else (cubic, wide, moderately flat): nice 3/4 view
        elevation = 0.55;
      }
    }

    // Calculate distance needed to fit the sphere in view
    const fov = (camera as THREE.PerspectiveCamera).fov;
    const fovRad = THREE.MathUtils.degToRad(fov);
    const distance = (radius * padding) / Math.sin(fovRad / 2);

    if (startEmpty) {
      // Author-driven camera position. Orientation falls out of lookAt(center).
      (startEmpty as THREE.Object3D).getWorldPosition(camera.position);
    } else {
      // Position camera with elevation + azimuth for a 3/4 perspective.
      const cameraOffset = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation) * distance,
        Math.sin(elevation) * distance,
        Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
      camera.position.copy(center).add(cameraOffset);
    }

    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.near = Math.max(0.05, minDistance * 0.08);
    // Floor needs to clear GradientSky's 800-unit dome, otherwise atmosphere
    // zones lose the sky + get a transparent canvas that bleeds the page bg.
    perspectiveCamera.far = Math.max(maxDistance + radius * 3, 2000);
    perspectiveCamera.updateProjectionMatrix();

    camera.lookAt(center);

    // Update orbit controls
    const controls = orbitRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.minDistance = minDistance;
      controls.maxDistance = maxDistance;
      controls.update();
    }

    setReady(true);
  }, [
    scene,
    camera,
    orbitRef,
    padding,
    elevationOverride,
    azimuth,
    minZoomMultiplier,
    maxZoomMultiplier,
  ]);

  return ready;
}
