// ToyInteractor.tsx

import { useRef, useMemo, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { getToyConfig, type ToyAnimation } from "./sceneMap";
import { playCyclingSound } from "./audio";
import * as THREE from "three";

/** Screen-space radius (px) within which the cursor reveals a toy label */
const REVEAL_RADIUS = 120;
/** How long (seconds) a label lingers after cursor leaves proximity */
const LINGER_TIME = 1.5;
/** Fade in/out speed (opacity units per second) */
const FADE_SPEED = 3;

interface ToyData {
  obj: THREE.Object3D;
  baseY: number;
  label: string;
  showLabel: boolean;
  sounds: string[] | null;
  meshes: THREE.Mesh[];
  animation: ToyAnimation;
  quiet: boolean;
  focusDistance?: number;
  focusBehavior?: "fit" | "instant";
}

interface ToyState {
  opacity: number;
  lastNear: number; // timestamp when cursor was last within radius
  hovered: boolean; // direct mesh hover
  labelDiv: HTMLDivElement | null;
}

function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

/** Collect meshes, skipping any subtree rooted at a `_hitbox` object. */
function collectMeshesExcludingHitboxes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (o !== obj && o.name?.toLowerCase().endsWith("_hitbox")) return;
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    for (const c of o.children) walk(c);
  };
  walk(obj);
  return meshes;
}

import { setToyUnderPointer } from "./toyClickFlag";
import { DEBUG_HITBOXES } from "./debugFlags";

/**
 * ToyInteractor — gentle bob + click-to-spin + sound + proximity labels.
 *
 * Labels are hidden by default. When the cursor moves near a toy (within
 * REVEAL_RADIUS px in screen space), its label fades in. Labels linger for
 * LINGER_TIME seconds after the cursor moves away, then fade out.
 *
 * Direct mesh hover shows a brighter highlight. Click triggers a Z-axis
 * spin + Pokemon cry.
 */
export default function ToyInteractor({
  scene,
  animations = [],
  onHoverChange,
  onFocus,
}: {
  scene: THREE.Object3D;
  animations?: THREE.AnimationClip[];
  onHoverChange?: (objects: THREE.Object3D[], hovered: boolean) => void;
  onFocus?: (
    point: THREE.Vector3,
    id?: string,
    radius?: number,
    opts?: { distance?: number; behavior?: "fit" | "instant" },
  ) => void;
}) {
  const lastHoveredToy = useRef<ToyData | null>(null);
  const spinState = useRef<
    Map<string, { startTime: number; startRotZ: number }>
  >(new Map());
  const hopState = useRef<Map<string, { startTime: number }>>(new Map());
  const growState = useRef<
    Map<string, { startTime: number; baseScale: THREE.Vector3 }>
  >(new Map());
  const wobbleState = useRef<
    Map<string, { startTime: number; startRotX: number }>
  >(new Map());
  const bobState = useRef<Map<string, { startTime: number }>>(new Map());

  // AnimationMixer for Blender-authored animations (harpy fly cycle, etc.)
  // Stores click-triggered actions per toy (keyed by object name)
  const actionClipsRef = useRef<Map<string, THREE.AnimationAction[]>>(
    new Map(),
  );
  const mixer = useMemo(() => {
    if (animations.length === 0) return null;
    const m = new THREE.AnimationMixer(scene);
    return m;
  }, [scene, animations]);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const mouseScreen = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const tmpVec3 = useMemo(() => new THREE.Vector3(), []);
  const tmpBox = useMemo(() => new THREE.Box3(), []);

  const toys = useMemo(() => {
    // Traverse the scene, consult sceneMap per object. No prefix heuristics.
    // Blender's .001/.002 dot-notation duplicates are normalized to base name
    // so meshes from duplicates fold into the base toy entry.
    const normalizeName = (lower: string) => lower.replace(/\.\d+$/, "");

    // Pass 1: find every `<name>_hitbox` subtree and make its meshes
    // invisible-to-render but still raycast-hittable. We swap each mesh's
    // material for a fully-transparent one (rather than toggling `.visible`,
    // which would also skip the raycaster). A hitbox can then stand in as
    // the click target for its paired toy.
    const hitboxByTarget = new Map<string, THREE.Object3D>();
    const hitboxMat = DEBUG_HITBOXES
      ? new THREE.MeshBasicMaterial({
          color: "#7dd3fc",
          wireframe: true,
          transparent: true,
          opacity: 0.6,
        })
      : new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          colorWrite: false,
        });
    scene.traverse((obj) => {
      const lower = obj.name?.toLowerCase() ?? "";
      if (!lower.endsWith("_hitbox")) return;
      const target = normalizeName(lower.slice(0, -"_hitbox".length));
      hitboxByTarget.set(target, obj);
      obj.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = hitboxMat;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      });
    });

    const byBase = new Map<
      string,
      {
        primary: THREE.Object3D;
        meshes: THREE.Mesh[];
        config: NonNullable<ReturnType<typeof getToyConfig>>;
      }
    >();

    scene.traverse((child) => {
      if (!child.name) return;
      const lower = child.name.toLowerCase();
      if (lower.endsWith("_hitbox")) return; // never treat hitbox itself as a toy
      const base = normalizeName(lower);
      const config = getToyConfig(base);
      if (!config) return;
      if (config.interactive === false) return; // structural member — skip

      // If a paired hitbox exists, use IT as the raycast target; otherwise
      // fall back to the toy's own meshes (excluding any hitbox subtree that
      // happens to live under the toy, which we already hid above).
      const hitboxObj = hitboxByTarget.get(base);
      const meshes = hitboxObj
        ? collectMeshes(hitboxObj)
        : collectMeshesExcludingHitboxes(child);
      const existing = byBase.get(base);
      if (!existing) {
        byBase.set(base, { primary: child, meshes, config });
      } else {
        // Dot-suffix duplicate — merge meshes, prefer base-named primary
        if (lower === base) existing.primary = child;
        existing.meshes.push(...meshes);
      }
    });

    return Array.from(byBase.values()).map(({ primary, meshes, config }) => {
      return {
        obj: primary,
        baseY: primary.position.y,
        label: config.label,
        showLabel: config.showLabel,
        sounds: config.sounds,
        meshes,
        animation: config.animation,
        quiet: config.quiet,
        focusDistance: config.focusDistance,
        focusBehavior: config.focusBehavior,
      } satisfies ToyData;
    });
  }, [scene]);

  // Categorize Blender animations: longest clip = idle loop, shorter clips = click actions
  useMemo(() => {
    if (!mixer || animations.length === 0) return;
    actionClipsRef.current.clear();

    const actionToys = toys.filter((t) => t.animation === "action");
    for (const toy of actionToys) {
      // Collect all descendant names for matching tracks to this toy
      const descendants = new Set<string>();
      toy.obj.traverse((d) => {
        if (d.name) descendants.add(d.name);
      });

      // Find clips whose tracks reference this toy's descendants
      const toyClips: THREE.AnimationClip[] = [];
      for (const clip of animations) {
        if (clip.duration <= 0) continue; // skip zero-length clips like "STAY STILL"
        const hasMatch = clip.tracks.some((track) => {
          const dotIdx = track.name.indexOf(".");
          if (dotIdx < 0) return false;
          const nodePath = track.name.slice(0, dotIdx);
          return nodePath.split("/").some((part) => descendants.has(part));
        });
        if (hasMatch) toyClips.push(clip);
      }

      if (toyClips.length === 0) continue;

      // Sort by duration descending — longest = idle loop
      toyClips.sort((a, b) => b.duration - a.duration);

      // First clip = idle (loop always)
      const idleAction = mixer.clipAction(toyClips[0]);
      idleAction.play();

      // Rest = action clips (play once on click)
      const clickActions: THREE.AnimationAction[] = [];
      for (let i = 1; i < toyClips.length; i++) {
        const action = mixer.clipAction(toyClips[i]);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false; // reset to start after playing
        clickActions.push(action);
      }

      actionClipsRef.current.set(toy.obj.name, clickActions);
    }
  }, [mixer, animations, toys]);

  // Per-toy mutable state (not React state — updated in useFrame for performance)
  const toyStates = useRef<Map<string, ToyState>>(new Map());
  // Initialize states
  useMemo(() => {
    for (const toy of toys) {
      if (!toyStates.current.has(toy.obj.name)) {
        toyStates.current.set(toy.obj.name, {
          opacity: 0,
          lastNear: 0,
          hovered: false,
          labelDiv: null,
        });
      }
    }
  }, [toys]);

  // All toy meshes for raycasting
  const allMeshes = useMemo(() => toys.flatMap((t) => t.meshes), [toys]);
  const meshToToy = useMemo(() => {
    const map = new Map<THREE.Mesh, ToyData>();
    for (const toy of toys) {
      for (const mesh of toy.meshes) map.set(mesh, toy);
    }
    return map;
  }, [toys]);

  const hitTest = useCallback(
    (e: PointerEvent | MouseEvent): ToyData | null => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(allMeshes, false);
      if (hits.length > 0) {
        return meshToToy.get(hits[0].object as THREE.Mesh) ?? null;
      }
      return null;
    },
    [gl, camera, raycaster, pointer, allMeshes, meshToToy],
  );

  const triggerAnimation = useCallback((toy: ToyData) => {
    const name = toy.obj.name;
    if (toy.animation === "hop") {
      if (hopState.current.has(name)) return;
      hopState.current.set(name, { startTime: -1 });
    } else if (toy.animation === "grow") {
      if (growState.current.has(name)) return;
      growState.current.set(name, {
        startTime: -1,
        baseScale: toy.obj.scale.clone(),
      });
    } else if (toy.animation === "wobble") {
      if (wobbleState.current.has(name)) return;
      wobbleState.current.set(name, {
        startTime: -1,
        startRotX: toy.obj.rotation.x,
      });
    } else if (toy.animation === "bob") {
      if (bobState.current.has(name)) return;
      bobState.current.set(name, { startTime: -1 });
    } else if (toy.animation === "action") {
      // Play Blender-authored action clips once (e.g. harpy loop-de-loop)
      const actions = actionClipsRef.current.get(name);
      if (actions) {
        for (const action of actions) {
          action.reset().play();
        }
      }
    } else if (toy.animation !== "none") {
      // 'spin' (default)
      if (spinState.current.has(name)) return;
      spinState.current.set(name, {
        startTime: -1,
        startRotZ: toy.obj.rotation.y,
      });
    }
    // Sound plays regardless of animation type (e.g. dinosaur: none + sound).
    // One entry = plays that sound every click; multiple = cycles through them.
    if (toy.sounds?.length) {
      playCyclingSound(toy.obj.name, toy.sounds);
    }
  }, []);

  // Canvas event listeners for hover + click + mouse tracking
  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerMove = (e: PointerEvent) => {
      // Track screen position for proximity check in useFrame
      mouseScreen.current = { x: e.clientX, y: e.clientY };

      // Direct mesh hover for cursor + highlight
      const toy = hitTest(e);
      // Update hovered state for all toys
      for (const [name, state] of toyStates.current) {
        state.hovered = toy?.obj.name === name;
      }

      // Notify parent when hovered toy changes. Quiet toys belong to their
      // parent zone's outline group instead of emitting a toy-level outline.
      if (toy?.obj.name !== lastHoveredToy.current?.obj.name) {
        if (lastHoveredToy.current && !lastHoveredToy.current.quiet) {
          onHoverChange?.([], false);
        }
        if (toy && !toy.quiet) onHoverChange?.(toy.meshes, true);
        lastHoveredToy.current = toy ?? null;
      }

      if (toy) {
        canvas.style.cursor = "pointer";
      } else if (canvas.style.cursor === "pointer") {
        canvas.style.cursor = "";
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.current = { x: e.clientX, y: e.clientY };
      const toy = hitTest(e);
      if (toy) {
        tmpBox.setFromObject(toy.obj);
        tmpBox.getCenter(tmpVec3);
        const size = new THREE.Vector3();
        tmpBox.getSize(size);
        const radius = size.length() / 2;
        onFocus?.(tmpVec3.clone(), `toy:${toy.obj.name}`, radius, {
          distance: toy.focusDistance,
          behavior: toy.focusBehavior,
        });
      }
      // Flag for ZoneHitbox: a toy is under the cursor, don't navigate
      setToyUnderPointer(!!toy);
    };

    // Capture phase: fires before R3F's bubble-phase zone/portal click handlers.
    // If a toy mesh is under the pointer, consume the event so zones don't navigate.
    const onClick = (e: MouseEvent) => {
      if (pointerDown.current) {
        const dx = e.clientX - pointerDown.current.x;
        const dy = e.clientY - pointerDown.current.y;
        if (dx * dx + dy * dy > 25) return;
      }
      const toy = hitTest(e);
      if (toy) {
        e.stopPropagation(); // block zone/portal click handlers
        triggerAnimation(toy);
      }
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("click", onClick, { capture: true });
    return () => {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("click", onClick, { capture: true });
      if (canvas.style.cursor === "pointer") canvas.style.cursor = "";
      if (lastHoveredToy.current) {
        if (!lastHoveredToy.current.quiet) onHoverChange?.([], false);
        lastHoveredToy.current = null;
      }
    };
  }, [gl, hitTest, triggerAnimation, onHoverChange, onFocus, tmpBox, tmpVec3]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const now = performance.now();
    const rect = gl.domElement.getBoundingClientRect();
    const delta = clock.getDelta() || 1 / 60;

    // Advance Blender-authored animations (harpy fly cycle, etc.)
    if (mixer) mixer.update(delta);

    for (const toy of toys) {
      // Idle animations (float/bob/spin) live in IdleAnimator — click
      // animations below write absolute transforms that override the idle
      // for the duration of the click.

      // Spin animation
      const spin = spinState.current.get(toy.obj.name);
      if (spin) {
        if (spin.startTime < 0) spin.startTime = t;
        const elapsed = t - spin.startTime;
        const duration = 0.6;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        toy.obj.rotation.y = spin.startRotZ + eased * Math.PI * 2;
        if (progress >= 1) {
          spinState.current.delete(toy.obj.name);
        }
      }

      // Pigeon hop animation — quick parabolic Y bounce
      const hop = hopState.current.get(toy.obj.name);
      if (hop) {
        if (hop.startTime < 0) hop.startTime = t;
        const elapsed = t - hop.startTime;
        const duration = 0.35;
        const progress = Math.min(elapsed / duration, 1);
        // Parabola: peaks at 0.5 progress, returns to 0 at 1.0
        const hopHeight = 0.75 * 8 * progress * (1 - progress);
        toy.obj.position.y = toy.baseY + hopHeight;
        if (progress >= 1) {
          hopState.current.delete(toy.obj.name);
        }
      }

      // Grow animation — scale pulse (origin at feet, so it "grows" upward)
      const grow = growState.current.get(toy.obj.name);
      if (grow) {
        if (grow.startTime < 0) grow.startTime = t;
        const elapsed = t - grow.startTime;
        const duration = 0.5;
        const progress = Math.min(elapsed / duration, 1);
        // Sine pulse: 0→1→0, peaks at 30% scale increase
        const scale = 1 + 0.3 * Math.sin(progress * Math.PI);
        toy.obj.scale.copy(grow.baseScale).multiplyScalar(scale);
        if (progress >= 1) {
          toy.obj.scale.copy(grow.baseScale);
          growState.current.delete(toy.obj.name);
        }
      }

      // Wobble animation — drinky-bird x-axis tip with decay
      const wobble = wobbleState.current.get(toy.obj.name);
      if (wobble) {
        if (wobble.startTime < 0) wobble.startTime = t;
        const elapsed = t - wobble.startTime;
        const duration = 1.5;
        const progress = Math.min(elapsed / duration, 1);
        // Decaying oscillation: 3 swings, amplitude shrinks to zero
        const amplitude = 0.5 * (1 - progress); // ~30° peak, decays
        const oscillation = Math.sin(progress * Math.PI * 6) * amplitude;
        toy.obj.rotation.x = wobble.startRotX + oscillation;
        if (progress >= 1) {
          toy.obj.rotation.x = wobble.startRotX;
          wobbleState.current.delete(toy.obj.name);
        }
      }

      // Bob animation — exaggerated y-axis undulations with decay (eagle)
      const bob = bobState.current.get(toy.obj.name);
      if (bob) {
        if (bob.startTime < 0) bob.startTime = t;
        const elapsed = t - bob.startTime;
        const duration = 2.0;
        const progress = Math.min(elapsed / duration, 1);
        // 5-6 undulations with decaying amplitude
        const amplitude = 0.9 * (1 - progress);
        const undulation = Math.sin(progress * Math.PI * 12) * amplitude;
        toy.obj.position.y = toy.baseY + undulation;
        if (progress >= 1) {
          toy.obj.position.y = toy.baseY;
          bobState.current.delete(toy.obj.name);
        }
      }

      // Proximity label reveal — project toy center to screen space
      const state = toyStates.current.get(toy.obj.name);
      if (!state) continue;

      // Get world-space center of the toy
      const box = new THREE.Box3().setFromObject(toy.obj);
      box.getCenter(tmpVec3);
      tmpVec3.project(camera);

      // Convert NDC to screen px
      const sx = (tmpVec3.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-tmpVec3.y * 0.5 + 0.5) * rect.height + rect.top;

      const dx = mouseScreen.current.x - sx;
      const dy = mouseScreen.current.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isNear = dist < REVEAL_RADIUS;

      if (isNear || state.hovered) {
        state.lastNear = now;
      }

      // Target opacity: 1 if near/hovered or within linger window, else 0
      const lingering = now - state.lastNear < LINGER_TIME * 1000;
      const targetOpacity = isNear || state.hovered || lingering ? 1 : 0;

      // Smooth fade
      if (state.opacity < targetOpacity) {
        state.opacity = Math.min(state.opacity + FADE_SPEED * delta, 1);
      } else if (state.opacity > targetOpacity) {
        state.opacity = Math.max(state.opacity - FADE_SPEED * delta, 0);
      }

      // Hover glow for labelless toys — subtle emissive tint
      if (!toy.showLabel) {
        for (const mesh of toy.meshes) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat.emissive) {
            if (state.hovered) {
              mat.emissive.setRGB(0.15, 0.15, 0.2);
              mat.emissiveIntensity = 0.5;
            } else {
              mat.emissive.setRGB(0, 0, 0);
              mat.emissiveIntensity = 0;
            }
          }
        }
      }

      // Update DOM directly for performance (no React re-renders per frame)
      if (state.labelDiv) {
        state.labelDiv.style.opacity = String(state.opacity);
        // Highlight on direct hover
        if (state.hovered) {
          state.labelDiv.style.color = "#7dd3fc";
          state.labelDiv.style.borderColor = "rgba(125,211,252,0.5)";
          state.labelDiv.style.boxShadow = "0 0 8px rgba(125,211,252,0.3)";
          state.labelDiv.style.background = "rgba(0,0,0,0.9)";
        } else {
          state.labelDiv.style.color = "#9ca3af";
          state.labelDiv.style.borderColor = "rgba(255,255,255,0.08)";
          state.labelDiv.style.boxShadow = "none";
          state.labelDiv.style.background = "rgba(0,0,0,0.7)";
        }
      }
    }
  });

  // Ref callback to capture label DOM elements
  const labelRef = useCallback(
    (name: string) => (el: HTMLDivElement | null) => {
      const state = toyStates.current.get(name);
      if (state) state.labelDiv = el;
    },
    [],
  );

  return (
    <>
      {DEBUG_HITBOXES &&
        toys.map((toy) => {
          const box = new THREE.Box3().setFromObject(toy.obj);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          return (
            <mesh
              key={`dbg-${toy.obj.name}`}
              position={center}
              raycast={() => null}
            >
              <boxGeometry args={[size.x, size.y, size.z]} />
              <meshBasicMaterial
                color="#7dd3fc"
                wireframe
                transparent
                opacity={0.5}
              />
            </mesh>
          );
        })}
      {toys
        .filter((t) => !t.quiet && t.showLabel)
        .map((toy) => {
          const box = new THREE.Box3().setFromObject(toy.obj);
          const labelPos = new THREE.Vector3();
          box.getCenter(labelPos);
          labelPos.y = box.max.y + 0.15;

          return (
            <Html
              key={toy.obj.name}
              position={labelPos}
              center
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={labelRef(toy.obj.name)}
                style={{
                  opacity: 0,
                  background: "rgba(0,0,0,0.7)",
                  color: "#9ca3af",
                  padding: "2px 7px",
                  borderRadius: "99px",
                  fontSize: "9px",
                  letterSpacing: "0.1em",
                  whiteSpace: "nowrap",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "none",
                  transition:
                    "color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s",
                }}
              >
                {toy.label}
              </div>
            </Html>
          );
        })}
    </>
  );
}
