// SceneAuditor.tsx
//
// Dev-only helper. Walks a loaded GLB scene, flags any object whose name
// matches the zone_/portal_/<x>_toy_ conventions but has no matching entry
// in sceneMap.ts. Surfaces the kind of "I added a toy in Blender and forgot
// to wire it up" misses that would otherwise just sit there silently.
//
// Renders nothing. Only active under `import.meta.env.DEV` — tree-shaken in
// production builds.

import { useEffect } from "react";
import type * as THREE from "three";
import { findNodeByObjectName } from "./sceneMap";

const NAME_RE = /^(zone_|portal_|i_toy_|[a-z]+_toy_|i_[a-z]+_toy_)/i;
// Suffixes Blender appends when names collide on import (.001, _01, etc.)
// We strip these before consulting sceneMap so duplicates don't all warn.
const DEDUPE_SUFFIX = /(\.\d+|_\d+)$/;

function looksLikeNamedNode(name: string): boolean {
  return NAME_RE.test(name);
}

export function auditScene(scene: THREE.Object3D, label: string): void {
  const seen = new Set<string>();
  const missing: string[] = [];

  scene.traverse((obj) => {
    const raw = obj.name;
    if (!raw || !looksLikeNamedNode(raw)) return;

    const stripped = raw.replace(DEDUPE_SUFFIX, "");
    if (seen.has(stripped)) return;
    seen.add(stripped);

    if (!findNodeByObjectName(stripped)) missing.push(raw);
  });

  if (missing.length === 0) return;
  console.warn(
    `[SceneAuditor] ${label}: ${missing.length} named object(s) without sceneMap entries:`,
    missing,
  );
}

export default function SceneAuditor({
  scene,
  label,
}: {
  scene: THREE.Object3D;
  label: string;
}) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    auditScene(scene, label);
  }, [scene, label]);
  return null;
}
