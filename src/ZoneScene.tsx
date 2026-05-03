// ZoneScene.tsx

import {
  Environment,
  Html,
  OrbitControls,
  useAnimations,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { Pause, Play } from "lucide-react";
import { useControls } from "leva";
import { ToneMappingMode } from "postprocessing";
import { Perf } from "r3f-perf";
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  acceleratedRaycast,
  MeshBVH,
  MeshBVHHelper,
  StaticGeometryGenerator,
} from "three-mesh-bvh";
import { AdaptiveLabel } from "./AdaptiveLabel";
import "./App.css";
import Breadcrumbs from "./Breadcrumbs";
import { showComingSoon } from "./comingSoonStore";
import { useDebugHitboxes, useDebugPerformanceMonitor } from "./debugFlags";
import { Atmosphere, AtmospherePanel, AtmosphereProvider } from "./environment";
import FlightPath, { type FlightPathConfig } from "./FlightPath";
import IdleAnimator from "./IdleAnimator";
import IdleClipPlayer from "./IdleClipPlayer";
import { collectMeshes } from "./meshUtils";
import OutlineController from "./Outline";
import { OUTLINE_STYLES, type OutlineKind } from "./outlineStyles";
import { computeOwnBounds } from "./ownBounds";
import {
  findNodeByObjectName,
  getFlightNodes,
  getNode,
  getPortalConfig,
  getToyConfig,
  getZoneConfig,
  sceneMap,
} from "./sceneMap";
import { SceneOptionsProvider } from "./SceneOptionsContext";
import SunRays from "./SunRays";
import { isToyUnderPointer } from "./toyClickFlag";
import ToyInteractor from "./ToyInteractor";
import { useAutoFitCamera } from "./useAutoFitCamera";
import { useCameraReset } from "./useCameraReset";
import { useFocusOrbit } from "./useFocusOrbit";
import { useKeyboardControls } from "./useKeyboardControls";
import { useLightingControls } from "./useLightingControls";
import { useOptimizedGLTF } from "./useOptimizedGLTF";
import { useSceneTransition } from "./useSceneTransition";
import { useTurntable } from "./useTurntable";
import Water from "./Water";
import Waterfall from "./Waterfall";

interface Hotspot {
  name: string;
  key: string;
  box: THREE.Box3;
  center: THREE.Vector3;
  label: string;
  url: string | null;
  internal: boolean;
  type: "active" | "coming-soon";
  sceneObj: THREE.Object3D;
  meshes: THREE.Mesh[];
  labelOffsetY: number;
  focusDistance?: number;
  focusBehavior?: "fit" | "instant";
  raycastMode: "default" | "bvh";
}

type HotspotBvhGeometry = THREE.BufferGeometry & { boundsTree?: MeshBVH };

interface HotspotBvhRaycast {
  generator: StaticGeometryGenerator;
  geometry: HotspotBvhGeometry;
  mesh: THREE.Mesh;
}

function refreshHotspotBvh(bvh: HotspotBvhRaycast) {
  bvh.generator.generate(bvh.geometry);
  bvh.geometry.boundsTree?.refit();
}

function HotspotBvhDebugHelper({ bvh }: { bvh: HotspotBvhRaycast }) {
  const helper = useMemo(() => {
    const h = new MeshBVHHelper(bvh.mesh, 10);
    h.color.set("#ff7055");
    h.opacity = 0.45;
    h.displayParents = false;
    h.displayEdges = true;
    h.update();
    return h;
  }, [bvh]);

  useFrame(() => {
    try {
      refreshHotspotBvh(bvh);
      helper.update();
    } catch (error) {
      console.warn("[ZoneScene] BVH hotspot debug helper failed.", error);
    }
  });

  return <primitive object={helper} raycast={() => null} />;
}

const HotspotHitbox = memo(function HotspotHitbox({
  hotspot,
  onNavigate,
  onComingSoon,
  onHoverChange,
  onFocus,
  isFocused,
}: {
  hotspot: Hotspot;
  onNavigate: (url: string, internal: boolean) => void;
  onComingSoon: (label: string) => void;
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void;
  onFocus: (
    point: THREE.Vector3,
    id?: string,
    radius?: number,
    opts?: { distance?: number; behavior?: "fit" | "instant" },
  ) => void;
  isFocused: (point: THREE.Vector3, id?: string) => boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const debugHitboxes = useDebugHitboxes();
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const size = useMemo(() => {
    const s = new THREE.Vector3();
    hotspot.box.getSize(s);
    return s;
  }, [hotspot.box]);
  // Half the bbox diagonal — the smallest bounding sphere radius.
  const focusRadius = useMemo(() => size.length() / 2, [size]);
  const focusOpts = useMemo(
    () => ({
      distance: hotspot.focusDistance,
      behavior: hotspot.focusBehavior,
    }),
    [hotspot.focusDistance, hotspot.focusBehavior],
  );

  const bvh = useMemo<HotspotBvhRaycast | null>(() => {
    if (hotspot.raycastMode !== "bvh") return null;
    try {
      const generator = new StaticGeometryGenerator(hotspot.sceneObj);
      generator.useGroups = false;
      generator.applyWorldTransforms = true;
      const geometry = generator.generate() as HotspotBvhGeometry;
      geometry.boundsTree = new MeshBVH(geometry);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          visible: false,
          depthWrite: false,
          colorWrite: false,
        }),
      );
      mesh.name = `${hotspot.name}_bvh_hit`;
      mesh.raycast = acceleratedRaycast;
      mesh.matrixAutoUpdate = false;
      return { generator, geometry, mesh };
    } catch (error) {
      console.warn(
        `[ZoneScene] BVH raycast setup failed for ${hotspot.name}; falling back to box hitbox.`,
        error,
      );
      return null;
    }
  }, [hotspot]);

  // Track the underlying obj's world position every frame so animated zones
  // (e.g. an orbiting Great Fox parented to a rotating empty) stay clickable.
  // For static zones this is a no-op — the value just doesn't change.
  // Also refresh BVH snapshots for deformed/animated geometry.
  useFrame(() => {
    if (groupRef.current && hotspot.sceneObj) {
      hotspot.sceneObj.getWorldPosition(groupRef.current.position);
    }
    if (bvh) {
      try {
        refreshHotspotBvh(bvh);
      } catch (error) {
        console.warn(
          `[ZoneScene] BVH raycast refresh failed for ${hotspot.name}.`,
          error,
        );
      }
    }
  });

  const pointerHandlers = {
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHovered(true);
      onHoverChange(hotspot, true);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      setHovered(false);
      onHoverChange(hotspot, false);
      document.body.style.cursor = "auto";
    },
    onPointerDown: (e: { clientX: number; clientY: number }) => {
      pointerDown.current = { x: e.clientX, y: e.clientY };
    },
    onClick: (e: {
      stopPropagation: () => void;
      clientX: number;
      clientY: number;
    }) => {
      e.stopPropagation();
      // If ToyInteractor detected a toy under the cursor on pointerdown,
      // bail — let the toy's capture-phase handler own this click.
      // Matches IslandScene's ZoneHitbox guard; without it, clicking a
      // toy parented atop a portal (e.g. weather_dance on weather_report)
      // triggers the portal's navigate on the second click.
      if (isToyUnderPointer()) return;
      if (pointerDown.current) {
        const dx = e.clientX - pointerDown.current.x;
        const dy = e.clientY - pointerDown.current.y;
        if (dx * dx + dy * dy > 25) return;
      }
      // Use live world position for animated zones (e.g. orbiting
      // Great Fox); falls through to hotspot.center for static zones.
      const liveCenter = new THREE.Vector3();
      if (hotspot.sceneObj) {
        hotspot.sceneObj.getWorldPosition(liveCenter);
      } else {
        liveCenter.copy(hotspot.center);
      }
      if (!isFocused(liveCenter, hotspot.key)) {
        onFocus(liveCenter, hotspot.key, focusRadius, focusOpts);
        // For "instant" behavior, fire the action on this same click —
        // the focus call just marks the thing as focused without tweening.
        if (focusOpts.behavior !== "instant") return;
      }
      if (hotspot.url) {
        onNavigate(hotspot.url, hotspot.internal);
      } else {
        onComingSoon(hotspot.label);
      }
    },
  };

  const label = (
    <AdaptiveLabel
      position={[0, size.y / 2 + 0.2 + hotspot.labelOffsetY, 0]}
      nearDistance={5}
      farDistance={20}
    >
      <div
        style={{
          background: hovered ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.75)",
          color: hovered
            ? hotspot.url
              ? "#ff8a6a"
              : "#7dd3fc"
            : hotspot.url
              ? "#e05a3a"
              : "#9ca3af",
          padding: hovered ? "4px 14px" : "3px 10px",
          borderRadius: "99px",
          fontSize: hovered ? "14px" : "12px",
          letterSpacing: "0.1em",
          whiteSpace: "nowrap",
          border: `1px solid ${
            hovered
              ? hotspot.url
                ? "rgba(224,90,58,0.8)"
                : "rgba(125,211,252,0.5)"
              : "rgba(255,255,255,0.1)"
          }`,
          boxShadow: hovered
            ? `0 0 12px ${hotspot.url ? "rgba(224,90,58,0.5)" : "rgba(125,211,252,0.3)"}`
            : "none",
          transition: "all 0.15s ease",
        }}
      >
        {hotspot.label}
      </div>
    </AdaptiveLabel>
  );

  if (bvh) {
    return (
      <>
        <primitive object={bvh.mesh} {...pointerHandlers} />
        {debugHitboxes && <HotspotBvhDebugHelper bvh={bvh} />}
        <group ref={groupRef} position={hotspot.center}>
          {label}
        </group>
      </>
    );
  }

  return (
    <group ref={groupRef} position={hotspot.center}>
      <mesh {...pointerHandlers}>
        <boxGeometry args={[size.x, size.y, size.z]} />
        {debugHitboxes ? (
          <meshBasicMaterial
            color={hotspot.url ? "#ff7055" : "#8a6ac0"}
            wireframe
            transparent
            opacity={0.6}
          />
        ) : (
          <meshStandardMaterial visible={false} />
        )}
      </mesh>
      {label}
    </group>
  );
});

/**
 * Walk the scene and collect zone_/portal_ objects at any depth. Stops
 * descending into a found zone/portal so nested decoration doesn't get
 * picked up. Used by buildHotspots — supports nesting like
 * `0_great_fox_orbit_idle > zone_starlight_zone` for animated zones.
 */
function findHotspotObjects(scene: THREE.Object3D): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  const seen = new Set<string>();
  const walk = (obj: THREE.Object3D) => {
    const lower = obj.name?.toLowerCase() ?? "";
    if (lower.endsWith("_hitbox")) return;
    if (/_flight_(?:start|end|finish)(?:_\d+)?$/.test(lower)) return;
    if (/_barrel_roll_trigger(?:_\d+)?$/.test(lower)) return;
    if (lower.endsWith("_nose")) return;
    if (lower.startsWith("zone_") || lower.startsWith("portal_")) {
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(obj);
      }
      return; // don't descend — children belong to this zone
    }
    for (const c of obj.children) walk(c);
  };
  for (const c of scene.children) walk(c);
  return result;
}

/**
 * Build hotspots by scanning the zone GLB for zone_/portal_ objects and
 * grouping toys by sceneMap `parent`. `<zone_name>_hitbox` overrides bbox.
 */
function buildHotspots(scene: THREE.Object3D): Hotspot[] {
  const hotspotObjects = findHotspotObjects(scene);
  const hitboxMap = new Map<string, THREE.Object3D>();

  scene.traverse((obj) => {
    const lower = obj.name.toLowerCase();
    if (lower.endsWith("_hitbox")) {
      const target = lower.slice(0, -"_hitbox".length);
      hitboxMap.set(target, obj);
    }
  });

  // Pass 2: group toy meshes by sceneMap parent key.
  const toysByParent = new Map<string, THREE.Mesh[]>();
  scene.traverse((obj) => {
    if (!obj.name) return;
    const node = sceneMap.get(obj.name.toLowerCase());
    if (!node || node.type !== "toy" || !node.parent) return;
    const list = toysByParent.get(node.parent) ?? [];
    list.push(...collectMeshes(obj));
    toysByParent.set(node.parent, list);
  });

  // Pass 3: build hotspots.
  const result: Hotspot[] = [];
  for (const obj of hotspotObjects) {
    const lower = obj.name.toLowerCase();
    const key = lower.replace(/^(portal_|zone_)/, "");
    const canonicalKey = findNodeByObjectName(obj.name)?.key ?? key;
    const config = lower.startsWith("portal_")
      ? (() => {
          const p = getPortalConfig(key);
          return {
            label: p?.label ?? key,
            url: p?.url ?? null,
            internal: false,
            type: (p ? "active" : "coming-soon") as "active" | "coming-soon",
          };
        })()
      : getZoneConfig(obj.name);

    const objMeshes = collectMeshes(obj);
    const memberMeshes = toysByParent.get(canonicalKey) ?? [];

    const hitboxObj = hitboxMap.get(lower) ?? hitboxMap.get(key);
    let box: THREE.Box3;
    if (hitboxObj) {
      box = new THREE.Box3().setFromObject(hitboxObj);
      hitboxObj.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).visible = false;
      });
    } else {
      // computeOwnBounds skips Blender-parented descendants that have their
      // own sceneMap entry — so e.g. ct_toy_weather_dance parented to
      // portal_weather_report no longer expands the portal's hitbox.
      box = computeOwnBounds(obj);
    }

    const center = new THREE.Vector3();
    box.getCenter(center);

    const node = findNodeByObjectName(obj.name);
    result.push({
      name: obj.name,
      key,
      box,
      center,
      label: config.label,
      url: config.url,
      internal: config.internal,
      type: config.type,
      sceneObj: obj,
      meshes: [...objMeshes, ...memberMeshes],
      labelOffsetY: node?.labelOffsetY ?? 0,
      focusDistance: node?.focusDistance,
      focusBehavior: node?.focusBehavior,
      raycastMode: node?.raycast ?? "default",
    });
  }

  return result;
}

function clipTargetsActionToy(clip: THREE.AnimationClip): boolean {
  return clip.tracks.some((track) => {
    const dotIdx = track.name.indexOf(".");
    if (dotIdx < 0) return false;
    const nodePath = track.name.slice(0, dotIdx);
    return nodePath.split("/").some((part) => {
      const base = part.toLowerCase().replace(/\.\d+$/, "");
      return getToyConfig(base)?.animation === "action";
    });
  });
}

function ZoneMesh({
  glbPath,
  zoneKey,
  lightingMode,
  onNavigate,
  onComingSoon,
  onSceneReady,
  onHoverChange,
  onToyHoverChange,
  onFocus,
  isFocused,
  allMeshesRef,
}: {
  glbPath: string;
  zoneKey: string;
  lightingMode: ZoneLightingMode;
  onNavigate: (url: string, internal: boolean) => void;
  onComingSoon: (label: string) => void;
  onSceneReady: (scene: THREE.Object3D) => void;
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void;
  onToyHoverChange: (objects: THREE.Object3D[], hovered: boolean) => void;
  onFocus: (
    point: THREE.Vector3,
    id?: string,
    radius?: number,
    opts?: { distance?: number; behavior?: "fit" | "instant" },
  ) => void;
  isFocused: (point: THREE.Vector3, id?: string) => boolean;
  allMeshesRef: React.RefObject<Map<string, THREE.Mesh[]>>;
}) {
  const { scene, animations } = useOptimizedGLTF(glbPath);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    Object.entries(actions).forEach(([name, action]) => {
      const clip = animations.find((candidate) => candidate.name === name);
      if (!clip || !clipTargetsActionToy(clip)) action?.play();
    });
  }, [actions, animations]);

  useEffect(() => {
    const portalMats = new Set<THREE.Material>();
    const hiddenBirdSanctuaryHelpers = new Set([
      "forest_maze_016_btld06a_glass01",
      "forest_maze_017_btld06a_glass02",
      "forest_maze_018_btld06a_glass03",
    ]);

    const collectMats = (obj: THREE.Object3D, bucket: Set<THREE.Material>) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) bucket.add(m);
      }
    };

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const hide =
          zoneKey === "bird_sanctuary" &&
          hiddenBirdSanctuaryHelpers.has(obj.name.toLowerCase());
        // Reset visibility explicitly — drei caches the scene graph across
        // navigations, so a prior run's hide flag can persist otherwise.
        mesh.visible = !hide;
        // No global castShadow/receiveShadow here. Setting these on every
        // mesh in every zone (added 2026-04-18 with the Cloud Town atmosphere
        // PR) made non-atmosphere zones self-shadow themselves into looking
        // like nighttime — every pagoda roof shadowing the level below,
        // every reading-room wall shadowing the floor. Atmosphere zones get
        // shadows via the `shadows` Canvas prop being gated below.
        if (hide) return;
        // Blender exports sometimes ship stale bounding info, making large or
        // oddly-pivoted meshes vanish mid-orbit. Disable culling scene-wide.
        mesh.frustumCulled = false;
      }
    });

    // Nudge ALL descendants of portal_ roots forward in depth. The portal is
    // usually a Group (portal_bird_bingo) with unnamed child meshes — without
    // traversing in, polygonOffset wouldn't reach the actual tree mesh.
    for (const child of scene.children) {
      if (!child.name.toLowerCase().startsWith("portal_")) continue;
      child.traverse((o) => collectMats(o, portalMats));
    }
    for (const m of portalMats) {
      (m as any).polygonOffset = true;
      (m as any).polygonOffsetFactor = -2;
      (m as any).polygonOffsetUnits = -2;
    }

    onSceneReady(scene);
  }, [scene, onSceneReady, zoneKey]);

  const hotspots = useMemo(() => {
    const result = buildHotspots(scene);
    for (const hotspot of result) {
      allMeshesRef.current.set(hotspot.name, hotspot.meshes);
    }
    return result;
  }, [scene, allMeshesRef]);

  const flightConfigs = useMemo<FlightPathConfig[]>(() => {
    // Drive flight config off sceneMap, not name-scanning the GLB. Each toy
    // (or zone/portal) with a `flight: { ... }` field gets a FlightPath
    // mounted; multiple toys can share a `pathGroup` to fly the same empties
    // staggered by `phase`.
    const sceneNames = new Set<string>();
    scene.traverse((o) => {
      if (o.name) sceneNames.add(o.name.toLowerCase());
    });
    return getFlightNodes()
      .filter((node) => sceneNames.has(node.key.toLowerCase()))
      .map((node) => ({
        objectName: node.key,
        pathGroup: node.flight!.group,
        phaseOffset: node.flight!.phase ?? 0,
        duration: node.flight!.duration ?? 18,
        rollTriggerRadius: node.flight!.rollTriggerRadius,
        fadeIn: 0.15,
        fadeOut: 0.15,
      }));
  }, [scene]);

  return (
    <>
      <primitive object={scene} />
      <UnlitMaterialSwitch scene={scene} mode={lightingMode} />
      <IdleAnimator scene={scene} />
      <ToyInteractor
        scene={scene}
        animations={animations}
        onHoverChange={onToyHoverChange}
        onFocus={onFocus}
      />
      {hotspots.map((hotspot) => (
        <HotspotHitbox
          key={hotspot.name}
          hotspot={hotspot}
          onNavigate={onNavigate}
          onComingSoon={onComingSoon}
          onHoverChange={onHoverChange}
          onFocus={onFocus}
          isFocused={isFocused}
        />
      ))}
      {flightConfigs.map((config) => (
        <FlightPath key={config.objectName} scene={scene} config={config} />
      ))}
      <IdleClipPlayer scene={scene} animations={animations} />
      <Waterfall scene={scene} />
    </>
  );
}

function BirdSanctuaryLighting() {
  return (
    <>
      <hemisphereLight color="#cfeeff" groundColor="#28401b" intensity={0.9} />
      <directionalLight
        position={[14, 18, 10]}
        intensity={1.35}
        color="#ffe0b5"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight
        position={[-10, 8, -12]}
        intensity={0.7}
        color="#83cfff"
      />
      <pointLight
        position={[0, 4.5, 1]}
        intensity={22}
        distance={28}
        decay={2}
        color="#ffd6a1"
      />
    </>
  );
}

/**
 * "Unlit" mode for zones: convert every MeshStandardMaterial in the loaded
 * GLB scene to MeshBasicMaterial (preserving texture map + base color +
 * alpha). MeshBasicMaterial ignores lighting — pure textures, no shading.
 *
 * This intentionally affects only the zone model passed into ZoneMesh. Sky,
 * weather, stars, fog, and other atmosphere subsystems are separate Canvas
 * children and keep running in unlit mode.
 */
export type ZoneLightingMode = "lit" | "unlit";

function UnlitMaterialSwitch({
  scene,
  mode,
}: {
  scene: THREE.Object3D;
  mode: ZoneLightingMode;
}) {
  const originals = useRef(
    new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(),
  );

  useEffect(() => {
    const map = originals.current;
    const toBasic = (mat: THREE.Material): THREE.Material => {
      const std = mat as THREE.MeshStandardMaterial;
      return new THREE.MeshBasicMaterial({
        map: std.map ?? null,
        color: std.color ?? new THREE.Color("#ffffff"),
        transparent: std.transparent,
        opacity: std.opacity,
        side: std.side,
        alphaMap: std.alphaMap ?? null,
        alphaTest: std.alphaTest,
      });
    };
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mode === "unlit") {
        if (!map.has(mesh)) map.set(mesh, mesh.material);
        const cur = mesh.material;
        mesh.material = Array.isArray(cur)
          ? cur.map(toBasic)
          : toBasic(cur as THREE.Material);
      } else {
        const orig = map.get(mesh);
        if (orig) mesh.material = orig;
      }
    });
  }, [scene, mode]);

  return null;
}

function LoadingFallback() {
  return (
    <Html center>
      <span
        style={{ color: "#6b7280", fontSize: "12px", letterSpacing: "0.1em" }}
      >
        LOADING...
      </span>
    </Html>
  );
}

/** Connects keyboard controls + auto-fit camera + turntable to OrbitControls */
function CameraRig({
  orbitRef,
  scene,
  cameraOptions,
  turntableEnabled,
  turntableToggleRef,
  onPlayingChange,
  onCameraReady,
}: {
  orbitRef: React.RefObject<any>;
  scene: THREE.Object3D | null;
  cameraOptions?: {
    padding?: number;
    elevation?: number;
    azimuth?: number;
    minZoomMultiplier?: number;
    maxZoomMultiplier?: number;
  };
  turntableEnabled: boolean;
  turntableToggleRef: React.RefObject<(() => void) | null>;
  onPlayingChange: (playing: boolean) => void;
  onCameraReady: (ready: boolean) => void;
}) {
  const { stop, toggle, playing } = useTurntable(orbitRef, {
    enabled: turntableEnabled,
  });
  useKeyboardControls(orbitRef, { onInteract: stop });

  const ready = useAutoFitCamera(scene, orbitRef, {
    ...(cameraOptions?.padding != null && { padding: cameraOptions.padding }),
    ...(cameraOptions?.elevation != null && {
      elevation: cameraOptions.elevation,
    }),
    ...(cameraOptions?.azimuth != null && { azimuth: cameraOptions.azimuth }),
    ...(cameraOptions?.minZoomMultiplier != null && {
      minZoomMultiplier: cameraOptions.minZoomMultiplier,
    }),
    ...(cameraOptions?.maxZoomMultiplier != null && {
      maxZoomMultiplier: cameraOptions.maxZoomMultiplier,
    }),
  });

  turntableToggleRef.current = toggle;

  useEffect(() => {
    onPlayingChange(playing);
  }, [playing, onPlayingChange]);

  useEffect(() => {
    onCameraReady(ready);
  }, [ready, onCameraReady]);

  useCameraReset(orbitRef, ready);

  return null;
}

interface ZoneSceneProps {
  glbPath: string;
  zoneKey: string;
  title: string;
  subtitle?: string;
  /** Override auto-fit camera. elevation/azimuth in radians, padding multiplier. */
  camera?: {
    padding?: number;
    elevation?: number;
    azimuth?: number;
    minZoomMultiplier?: number;
    maxZoomMultiplier?: number;
  };
  environmentPreset?:
    | "night"
    | "forest"
    | "sunset"
    | "dawn"
    | "apartment"
    | "city"
    | "park"
    | "lobby"
    | "studio"
    | "warehouse"
    | undefined;
}

export default function ZoneScene({
  glbPath,
  zoneKey,
  title,
  subtitle = "click on things to explore",
  camera: cameraOptions,
  environmentPreset,
}: ZoneSceneProps) {
  const atmosphereConfig = getNode(zoneKey)?.atmosphere;
  const fullBleed = getNode(zoneKey)?.fullBleed === true;
  const showPerformanceMonitor = useDebugPerformanceMonitor();
  const orbitRef = useRef<any>(null);
  const turntableToggleRef = useRef<(() => void) | null>(null);
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [turntablePlaying, setTurntablePlaying] = useState(true);
  const [hotspotOutlinedObjects, setHotspotOutlinedObjects] = useState<
    THREE.Object3D[]
  >([]);
  const [hotspotOutlineKind, setHotspotOutlineKind] =
    useState<OutlineKind>("active");
  const [toyOutlinedObjects, setToyOutlinedObjects] = useState<
    THREE.Object3D[]
  >([]);

  const { navigateWithTransition, wrapStyle } = useSceneTransition(cameraReady);

  const onHoverChange = useCallback((hotspot: Hotspot, hovered: boolean) => {
    setHotspotOutlinedObjects(hovered ? hotspot.meshes : []);
    setHotspotOutlineKind(
      hovered ? (hotspot.type === "active" ? "active" : "inactive") : "active",
    );
  }, []);

  const onToyHoverChange = useCallback(
    (objects: THREE.Object3D[], hovered: boolean) => {
      setToyOutlinedObjects(hovered ? objects : []);
    },
    [],
  );

  const { focus: focusOrbitTarget, isFocused } = useFocusOrbit(orbitRef);

  const onPlayingChange = useCallback((playing: boolean) => {
    setTurntablePlaying(playing);
  }, []);

  const hasToyOutline = toyOutlinedObjects.length > 0;
  const outlinedObjects = hasToyOutline
    ? toyOutlinedObjects
    : hotspotOutlinedObjects;
  const outlineSettings =
    OUTLINE_STYLES[hasToyOutline ? "toy" : hotspotOutlineKind];

  // When a zone declares an atmosphere config, the listed subsystems own the
  // lighting (sun + ambient). Otherwise fall back to the leva-driven
  // analytic lighting (same setup as IslandScene).
  const useAtmosphere = !!atmosphereConfig;

  // Per-zone lighting mode (lit/unlit). Persisted to localStorage per zone
  // so the setting survives refreshes. Default is "unlit" for all zones.
  const lightingModeKey = `sakhalteam.lightingMode.${zoneKey}`;
  const storedLightingMode = useMemo(() => {
    try {
      return (
        (window.localStorage.getItem(lightingModeKey) as
          | "lit"
          | "unlit"
          | null) ?? "unlit"
      );
    } catch {
      return "unlit";
    }
  }, [lightingModeKey]);
  const { lightingMode } = useControls(
    `zone · ${zoneKey}`,
    {
      lightingMode: {
        value: storedLightingMode,
        options: ["lit", "unlit"],
        label: "mode",
      },
    },
    [zoneKey],
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(lightingModeKey, lightingMode);
    } catch {
      // quota / privacy-mode: drop silently
    }
  }, [lightingModeKey, lightingMode]);
  const isLit = lightingMode === "lit";

  // Mount the shared lighting panel for every zone — atmosphere zones
  // included, since Nic should be able to inspect/tune anywhere. We only
  // *use* the values for non-atmosphere zones; atmosphere zones rely on
  // their <Atmosphere /> subsystems instead. Each zone gets its own
  // persistence bucket via the scope key.
  const lighting = useLightingControls(
    `zone:${zoneKey}`,
    `src/ZoneScene.tsx → zone "${zoneKey}"`,
    environmentPreset ? { envPreset: environmentPreset } : undefined,
  );

  const zoneClassName = `ocean ocean--${zoneKey.replace(/_/g, "-")} ${
    fullBleed ? "ocean--full-bleed" : ""
  }`;

  const sceneInner = (
    <div className={zoneClassName} data-zone={zoneKey}>
      <header className="site-header">
        <Breadcrumbs zoneKey={zoneKey} />
        <h1 className="site-title">{title}</h1>
        <p className="site-subtitle">{subtitle}</p>
      </header>

      <div className="map-wrap" style={wrapStyle}>
        <Canvas
          camera={{ fov: 50 }}
          shadows={useAtmosphere}
          style={{
            width: "100%",
            height: "100%",
            opacity: cameraReady ? 1 : 0,
          }}
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            if (useAtmosphere) {
              gl.toneMappingExposure = 1.3;
            }
          }}
        >
          {/* In unlit mode, UnlitMaterialSwitch (inside ZoneMesh) replaces the
              loaded GLB's MeshStandardMaterials with MeshBasicMaterials.
              Atmosphere stays mounted so sky/weather/time-of-day remain live. */}
          {showPerformanceMonitor && (
            <Perf
              className="perf-monitor"
              position="bottom-left"
              minimal={false}
              matrixUpdate
            />
          )}
          {useAtmosphere && <Atmosphere enabled={atmosphereConfig!.enabled} />}
          {isLit && !useAtmosphere && (
            <>
              <ambientLight intensity={lighting.ambientIntensity} />
              <directionalLight
                position={[lighting.sunX, lighting.sunY, lighting.sunZ]}
                intensity={lighting.sunIntensity}
                color={lighting.sunColor}
              />
              <directionalLight
                position={[-3, 2, -4]}
                intensity={lighting.fillIntensity}
                color={lighting.fillColor}
              />
              <Environment
                preset={lighting.envPreset as never}
                environmentIntensity={lighting.envIntensity}
                background={false}
              />
            </>
          )}
          {/* Atmosphere zones still rely on the legacy environmentPreset
              prop for their HDRI fill (kept for cloud_town's "city" preset). */}
          {useAtmosphere && environmentPreset && (
            <Environment preset={environmentPreset} background={false} />
          )}
          <Suspense fallback={<LoadingFallback />}>
            <ZoneMesh
              glbPath={glbPath}
              zoneKey={zoneKey}
              lightingMode={lightingMode as ZoneLightingMode}
              onNavigate={navigateWithTransition}
              onComingSoon={showComingSoon}
              onSceneReady={setLoadedScene}
              onHoverChange={onHoverChange}
              onToyHoverChange={onToyHoverChange}
              onFocus={focusOrbitTarget}
              isFocused={isFocused}
              allMeshesRef={allMeshesRef}
            />
          </Suspense>
          {zoneKey === "bird_sanctuary" && <BirdSanctuaryLighting />}
          {zoneKey === "bird_sanctuary" && <SunRays />}
          {zoneKey === "ss_brainfog" && (
            <Water size={320} color="#00fccd" opacity={0.7} />
          )}
          <OrbitControls
            ref={orbitRef}
            enablePan={true}
            zoomToCursor={true}
            zoomSpeed={4}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }}
          />
          <CameraRig
            orbitRef={orbitRef}
            scene={loadedScene}
            cameraOptions={cameraOptions}
            turntableEnabled={getNode(zoneKey)?.turntable !== false}
            turntableToggleRef={turntableToggleRef}
            onPlayingChange={onPlayingChange}
            onCameraReady={setCameraReady}
          />
          <EffectComposer multisampling={0} autoClear={false}>
            <OutlineController
              selectedObjects={outlinedObjects}
              settings={outlineSettings}
            />
            {useAtmosphere ? (
              <ToneMapping
                mode={ToneMappingMode.ACES_FILMIC}
                adaptive={false}
              />
            ) : (
              <></>
            )}
          </EffectComposer>
        </Canvas>
      </div>

      <footer className="site-footer">
        <span className="footer-hint">
          click objects to interact · drag to rotate · scroll to zoom · WASD pan
          · QE orbit · RF zoom · ZX rise/lower
        </span>
        <button
          className="turntable-toggle"
          onClick={() => turntableToggleRef.current?.()}
          title={turntablePlaying ? "Pause rotation" : "Resume rotation"}
          aria-label={turntablePlaying ? "Pause rotation" : "Resume rotation"}
        >
          {turntablePlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </footer>

      {useAtmosphere && atmosphereConfig!.controls && <AtmospherePanel />}
    </div>
  );

  if (!useAtmosphere)
    return <SceneOptionsProvider>{sceneInner}</SceneOptionsProvider>;

  return (
    <SceneOptionsProvider>
      <AtmosphereProvider
        initialHour={atmosphereConfig!.defaults?.hour}
        initialMinute={atmosphereConfig!.defaults?.minute}
        initialWeather={atmosphereConfig!.defaults?.weather}
        initialTimescale={atmosphereConfig!.defaults?.timescale}
      >
        {sceneInner}
      </AtmosphereProvider>
    </SceneOptionsProvider>
  );
}
