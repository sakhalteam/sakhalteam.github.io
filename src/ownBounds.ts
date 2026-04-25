// ownBounds.ts
//
// Computes a Box3 for an object from *only its own* geometry — descendants
// that belong to other sceneMap-registered nodes (toys, nested zones,
// portals) are skipped, as are FlightPath markers and `_hitbox` colliders.
//
// Motivation: when a toy is Blender-parented to a portal (e.g.
// ct_toy_weather_dance riding on portal_weather_report so it idles with the
// cloud), THREE.Box3.setFromObject(portal) naively swallows the dancer and
// produces a hitbox far larger than the cloud. The fix: bbox from the
// parent's own meshes, not its sceneMap-registered descendants.

import * as THREE from "three";
import { sceneMap } from "./sceneMap";

const FLIGHT_MARKER_RE = /_flight_(?:start|end|finish)(?:_\d+)?$/;
const BARREL_ROLL_RE = /_barrel_roll_trigger(?:_\d+)?$/;

function normalizeName(name: string): string {
  // Strip Blender's .001/.002 duplicate suffix so a .001 toy duplicate still
  // resolves to its sceneMap entry and gets excluded from the parent bbox.
  return name.toLowerCase().replace(/\.\d+$/, "");
}

/**
 * True when this object is a Blender-parented clickable entity in its own
 * right — meaning it has its own sceneMap entry (toy / zone / portal).
 */
function isOwnedByOtherNode(obj: THREE.Object3D): boolean {
  if (!obj.name) return false;
  return sceneMap.has(normalizeName(obj.name));
}

/**
 * True when this object is infrastructure (flight markers, barrel roll
 * triggers, _hitbox colliders) and should never contribute to a bbox.
 */
function isInfrastructure(obj: THREE.Object3D): boolean {
  const lower = obj.name?.toLowerCase() ?? "";
  if (!lower) return false;
  if (lower.endsWith("_hitbox")) return true;
  if (FLIGHT_MARKER_RE.test(lower)) return true;
  if (BARREL_ROLL_RE.test(lower)) return true;
  return false;
}

/**
 * Build a Box3 for `root` that counts only the meshes directly "owned" by
 * it — skipping any subtree rooted at another sceneMap entry or at an
 * infrastructure marker. `root` itself is always included regardless of
 * whether it has its own sceneMap entry.
 *
 * Options:
 *   visibleOnly — also skip subtrees whose root has `visible === false`.
 *     Useful for flight zones with swappable variant meshes where only one
 *     variant is shown at a time (arwing ranged/grounded).
 */
export function computeOwnBounds(
  root: THREE.Object3D,
  opts: { visibleOnly?: boolean } = {},
): THREE.Box3 {
  const box = new THREE.Box3();
  const expand = (obj: THREE.Object3D) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    mesh.updateWorldMatrix(true, false);
    const geom = mesh.geometry;
    if (!geom) return;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    const meshBox = geom.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    box.union(meshBox);
  };

  const walk = (obj: THREE.Object3D, isRoot: boolean) => {
    if (!isRoot) {
      if (isInfrastructure(obj)) return;
      if (isOwnedByOtherNode(obj)) return;
    }
    if (opts.visibleOnly && obj.visible === false) return;
    expand(obj);
    for (const child of obj.children) walk(child, false);
  };

  walk(root, true);
  if (box.isEmpty()) {
    // Fallback: object has no own meshes (pure empty). Use the object
    // transform's position so we at least anchor somewhere sensible.
    root.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
    box.set(pos.clone(), pos.clone());
  }
  return box;
}
