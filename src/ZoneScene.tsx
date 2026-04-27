// ZoneScene.tsx

import {
  Environment,
  Html,
  OrbitControls,
  useAnimations,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { AdaptiveLabel } from "./AdaptiveLabel";
import "./App.css";
import Breadcrumbs from "./Breadcrumbs";
import { showComingSoon } from "./comingSoonStore";
import { useDebugHitboxes } from "./debugFlags";
import { Atmosphere, AtmospherePanel, AtmosphereProvider } from "./environment";
import FlightPath, { type FlightPathConfig } from "./FlightPath";
import IdleAnimator from "./IdleAnimator";
import { collectMeshes } from "./meshUtils";
import OutlineController from "./Outline";
import { OUTLINE_STYLES, type OutlineKind } from "./outlineStyles";
import { computeOwnBounds } from "./ownBounds";
import {
  findNodeByObjectName,
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

  return (
    <group position={hotspot.center}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange(hotspot, true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          onHoverChange(hotspot, false);
          document.body.style.cursor = "auto";
        }}
        onPointerDown={(e) => {
          pointerDown.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
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
          if (!isFocused(hotspot.center, hotspot.key)) {
            onFocus(hotspot.center, hotspot.key, focusRadius, focusOpts);
            // For "instant" behavior, fire the action on this same click —
            // the focus call just marks the thing as focused without tweening.
            if (focusOpts.behavior !== "instant") return;
          }
          if (hotspot.url) {
            onNavigate(hotspot.url, hotspot.internal);
          } else {
            onComingSoon(hotspot.label);
          }
        }}
      >
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
    </group>
  );
});

/**
 * Scan the scene for objects paired with `<name>_flight_start` empties.
 * These zones are animated by FlightPath and should not receive a static hotspot.
 */
function findFlightedZoneNames(scene: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  const re = /^(.*)_flight_start(?:_\d+)?$/;
  scene.traverse((obj) => {
    const m = obj.name.toLowerCase().match(re);
    if (m) names.add(m[1]);
  });
  return names;
}

/**
 * Build hotspots by scanning the zone GLB for zone_/portal_ objects and
 * grouping toys by sceneMap `parent`. `<zone_name>_hitbox` overrides bbox.
 */
function buildHotspots(scene: THREE.Object3D): Hotspot[] {
  // Pass 1: find zone_/portal_ objects at scene root + _hitbox colliders.
  const hotspotObjects: THREE.Object3D[] = [];
  const hitboxMap = new Map<string, THREE.Object3D>();
  const flighted = findFlightedZoneNames(scene);
  const seen = new Set<string>();

  for (const child of scene.children) {
    const lower = child.name.toLowerCase();
    if (lower.endsWith("_hitbox")) continue;
    if (/_flight_(?:start|end|finish)(?:_\d+)?$/.test(lower)) continue;
    if (/_barrel_roll_trigger(?:_\d+)?$/.test(lower)) continue;
    if (lower.endsWith("_nose")) continue;
    // FlightPath owns its own click hitbox (follows the moving mesh) — skip
    // the static hotspot the normal scanner would add at the initial bbox.
    if (flighted.has(lower)) continue;
    if (lower.startsWith("zone_") || lower.startsWith("portal_")) {
      if (seen.has(lower)) continue;
      seen.add(lower);
      hotspotObjects.push(child);
    }
  }

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
        mesh.castShadow = !hide;
        mesh.receiveShadow = !hide;
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

  // Parent small warm point lights to clickable toys so they read well in
  // legacy (no-HDRI) zones like bird_sanctuary.
  useEffect(() => {
    const lights: THREE.PointLight[] = [];
    scene.traverse((obj) => {
      const node = sceneMap.get(obj.name.toLowerCase());
      if (!node || node.type !== "toy") return;
      // if (node.interactive === false || node.showOutline === false) return;
      const light = new THREE.PointLight("#ffd9a8", 8, 3, 1.5);
      light.position.set(0, 0.7, 0);
      obj.add(light);
      lights.push(light);
    });
    return () => {
      for (const l of lights) l.parent?.remove(l);
    };
  }, [scene]);

  const hotspots = useMemo(() => {
    const result = buildHotspots(scene);
    for (const hotspot of result) {
      allMeshesRef.current.set(hotspot.name, hotspot.meshes);
    }
    return result;
  }, [scene, allMeshesRef]);

  const flightConfigs = useMemo<FlightPathConfig[]>(() => {
    const flightTweaks: Partial<Record<string, Partial<FlightPathConfig>>> = {
      zone_starlight_zone: {
        duration: 10,
        rollTriggerRadius: 10,
      },
    };

    return [...findFlightedZoneNames(scene)].map((objectName) => {
      const tweak = flightTweaks[objectName] ?? {};
      return {
        objectName,
        duration: tweak.duration ?? 18,
        fadeIn: 0.15,
        fadeOut: 0.15,
        headingOffset: tweak.headingOffset,
        pitchOffset: tweak.pitchOffset,
        rollOffset: tweak.rollOffset,
        rollDuration: tweak.rollDuration,
        rollTriggerRadius: tweak.rollTriggerRadius,
      };
    });
  }, [scene]);

  return (
    <>
      <primitive object={scene} />
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
        <FlightPath
          key={config.objectName}
          scene={scene}
          config={config}
          onNavigate={onNavigate}
          onComingSoon={onComingSoon}
          onFocus={onFocus}
          isFocused={isFocused}
        />
      ))}
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
  // lighting (sun + ambient). Otherwise fall back to the legacy hardcoded
  // three-light setup so existing zones look identical.
  const useAtmosphere = !!atmosphereConfig;

  const sceneInner = (
    <div className={fullBleed ? "ocean ocean--full-bleed" : "ocean"}>
      <header className="site-header">
        <Breadcrumbs zoneKey={zoneKey} />
        <h1 className="site-title">{title}</h1>
        <p className="site-subtitle">{subtitle}</p>
      </header>

      <div className="map-wrap" style={wrapStyle}>
        <Canvas
          camera={{ fov: 50 }}
          shadows
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
          {useAtmosphere ? (
            <Atmosphere enabled={atmosphereConfig!.enabled} />
          ) : (
            <>
              <ambientLight intensity={0.5} />
              <directionalLight
                position={[5, 8, 3]}
                intensity={1.0}
                castShadow
              />
              <directionalLight
                position={[-3, 2, -4]}
                intensity={0.2}
                color="#88aaff"
              />
            </>
          )}
          {environmentPreset && (
            <Environment
              preset={environmentPreset}
              background={!useAtmosphere}
            />
          )}
          <Suspense fallback={<LoadingFallback />}>
            <ZoneMesh
              glbPath={glbPath}
              zoneKey={zoneKey}
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
        >
          {turntablePlaying ? "\u23F8" : "\u23F5"}
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
