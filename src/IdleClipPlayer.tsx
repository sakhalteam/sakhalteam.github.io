// IdleClipPlayer.tsx
//
// Auto-loops any GLB animation clip whose name contains "idle", "loop", or
// "cycle". Works on any object in the scene — toys, zones, portals — as
// long as the clip is named with the convention. Drop a Blender NLA strip
// with the right name, export, and it just plays.
//
// Pairs with ToyInteractor: that one handles click-triggered Blender clips
// (animation: "action" toys). They use independent mixers — a clip is
// either named-idle (handled here) or unnamed (handled there), never both.

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const IDLE_CLIP_RE = /idle|loop|cycle/i;

export default function IdleClipPlayer({
  scene,
  animations,
}: {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}) {
  const mixer = useMemo(() => {
    if (animations.length === 0) return null;
    return new THREE.AnimationMixer(scene);
  }, [scene, animations]);

  useEffect(() => {
    if (!mixer) return;
    const actions: THREE.AnimationAction[] = [];
    for (const clip of animations) {
      if (clip.duration <= 0) continue;
      if (!IDLE_CLIP_RE.test(clip.name)) continue;
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      actions.push(action);
    }
    return () => {
      for (const action of actions) action.stop();
      mixer.stopAllAction();
    };
  }, [mixer, animations]);

  useFrame((_, delta) => {
    mixer?.update(delta);
  });

  return null;
}
