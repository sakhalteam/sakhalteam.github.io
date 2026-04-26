import * as THREE from "three";

const FLIGHT_OR_ROLL_RE =
  /_(?:flight_(?:start|end|finish)|barrel_roll_trigger)(?:_\d+)?$/;

/** Collect all Mesh descendants of an Object3D (including itself if it's a mesh).
 *  Skips infrastructure subtrees — `*_hitbox` colliders and `*_flight_*` /
 *  `*_barrel_roll_trigger` markers — which exist for runtime wiring, not
 *  rendering, and must never be added to outline groups. */
export function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D, isRoot: boolean) => {
    if (!isRoot) {
      const lower = o.name?.toLowerCase() ?? "";
      if (lower.endsWith("_hitbox")) return;
      if (FLIGHT_OR_ROLL_RE.test(lower)) return;
    }
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    for (const c of o.children) walk(c, false);
  };
  walk(obj, true);
  return meshes;
}
