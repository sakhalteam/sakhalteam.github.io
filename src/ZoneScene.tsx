// ZoneScene.tsx

import {
  Environment,
  Html,
  OrbitControls,
  useAnimations,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { KernelSize, BlendFunction } from "postprocessing";
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
import "./App.css";
import { AdaptiveLabel } from "./AdaptiveLabel";
import OutlineController from "./Outline";
import { collectMeshes } from "./BloomDriver";
import { useAutoFitCamera } from "./useAutoFitCamera";
import { useKeyboardControls } from "./useKeyboardControls";
import { useOptimizedGLTF } from "./useOptimizedGLTF";
import { useTurntable } from "./useTurntable";
import { useSceneTransition } from "./useSceneTransition";
import {
  getPortalConfig,
  getZoneConfig,
  findNodeByObjectName,
  sceneMap,
} from "./sceneMap";
import ToyInteractor from "./ToyInteractor";
import Breadcrumbs from "./Breadcrumbs";

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
}

type OutlineKind = "active" | "inactive" | "toy";

const HotspotHitbox = memo(function HotspotHitbox({
  hotspot,
  onNavigate,
  onComingSoon,
  onHoverChange,
}: {
  hotspot: Hotspot;
  onNavigate: (url: string, internal: boolean) => void;
  onComingSoon: (label: string) => void;
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const size = useMemo(() => {
    const s = new THREE.Vector3();
    hotspot.box.getSize(s);
    return s;
  }, [hotspot.box]);

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
          if (pointerDown.current) {
            const dx = e.clientX - pointerDown.current.x;
            const dy = e.clientY - pointerDown.current.y;
            if (dx * dx + dy * dy > 25) return;
          }
          if (hotspot.url) {
            onNavigate(hotspot.url, hotspot.internal);
          } else {
            onComingSoon(hotspot.label);
          }
        }}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial visible={false} />
      </mesh>
      <AdaptiveLabel
        position={[0, size.y / 2 + 0.2, 0]}
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
 * Build hotspots by scanning the zone GLB for zone_/portal_ objects and
 * grouping toys by sceneMap `parent`. `<zone_name>_hitbox` overrides bbox.
 */
function buildHotspots(scene: THREE.Object3D): Hotspot[] {
  // Pass 1: find zone_/portal_ objects at scene root + _hitbox colliders.
  const hotspotObjects: THREE.Object3D[] = [];
  const hitboxMap = new Map<string, THREE.Object3D>();
  const seen = new Set<string>();

  for (const child of scene.children) {
    const lower = child.name.toLowerCase();
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

    const hitboxObj = hitboxMap.get(lower);
    let box: THREE.Box3;
    if (hitboxObj) {
      box = new THREE.Box3().setFromObject(hitboxObj);
      hitboxObj.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).visible = false;
      });
    } else {
      box = new THREE.Box3().setFromObject(obj);
    }

    const center = new THREE.Vector3();
    box.getCenter(center);

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
    });
  }

  return result;
}

function ZoneMesh({
  glbPath,
  onNavigate,
  onComingSoon,
  onSceneReady,
  onHoverChange,
  onToyHoverChange,
  allMeshesRef,
}: {
  glbPath: string;
  onNavigate: (url: string, internal: boolean) => void;
  onComingSoon: (label: string) => void;
  onSceneReady: (scene: THREE.Object3D) => void;
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void;
  onToyHoverChange: (objects: THREE.Object3D[], hovered: boolean) => void;
  allMeshesRef: React.RefObject<Map<string, THREE.Mesh[]>>;
}) {
  const { scene, animations } = useOptimizedGLTF(glbPath);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    Object.values(actions).forEach((action) => action?.play());
  }, [actions]);

  useEffect(() => {
    onSceneReady(scene);
  }, [scene, onSceneReady]);

  const hotspots = useMemo(() => {
    const result = buildHotspots(scene);
    for (const hotspot of result) {
      allMeshesRef.current.set(hotspot.name, hotspot.meshes);
    }
    return result;
  }, [scene, allMeshesRef]);

  return (
    <>
      <primitive object={scene} />
      <ToyInteractor scene={scene} onHoverChange={onToyHoverChange} />
      {hotspots.map((hotspot) => (
        <HotspotHitbox
          key={hotspot.name}
          hotspot={hotspot}
          onNavigate={onNavigate}
          onComingSoon={onComingSoon}
          onHoverChange={onHoverChange}
        />
      ))}
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
  turntableToggleRef: React.RefObject<(() => void) | null>;
  onPlayingChange: (playing: boolean) => void;
  onCameraReady: (ready: boolean) => void;
}) {
  const { stop, toggle, playing } = useTurntable(orbitRef);
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
    | "warehouse";
  /** Optional extra scene content (sky, weather, ambient props) rendered inside the Canvas. */
  extras?: React.ReactNode;
}

export default function ZoneScene({
  glbPath,
  zoneKey,
  title,
  subtitle = "click on things to explore",
  camera: cameraOptions,
  environmentPreset = "night",
  extras,
}: ZoneSceneProps) {
  const orbitRef = useRef<any>(null);
  const turntableToggleRef = useRef<(() => void) | null>(null);
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [turntablePlaying, setTurntablePlaying] = useState(true);
  const [outlinedObjects, setOutlinedObjects] = useState<THREE.Object3D[]>([]);
  const [outlineKind, setOutlineKind] = useState<OutlineKind>("active");
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  const { navigateWithTransition, wrapStyle } = useSceneTransition(cameraReady);

  const onHoverChange = useCallback((hotspot: Hotspot, hovered: boolean) => {
    setOutlinedObjects(hovered ? hotspot.meshes : []);
    setOutlineKind(
      hovered
        ? hotspot.type === "active"
          ? "active"
          : "inactive"
        : "active",
    );
  }, []);

  const onToyHoverChange = useCallback(
    (objects: THREE.Object3D[], hovered: boolean) => {
      setOutlinedObjects(hovered ? objects : []);
      setOutlineKind(hovered ? "toy" : "active");
    },
    [],
  );

  const onPlayingChange = useCallback((playing: boolean) => {
    setTurntablePlaying(playing);
  }, []);

  const activeOutlineSettings = {
    enabled: true,
    blur: false,
    xRay: false,
    edgeStrength: 2.0,
    pulseSpeed: 0,
    visibleEdgeColor: 0x00e5ff,
    hiddenEdgeColor: 0x000000,
    kernelSize: KernelSize.SMALL,
    blendFunction: BlendFunction.ALPHA,
    width: undefined,
    height: undefined,
    patternTexture: undefined,
  };

  const inactiveOutlineSettings = {
    enabled: true,
    blur: false,
    xRay: false,
    edgeStrength: 2.0,
    pulseSpeed: 0,
    visibleEdgeColor: 0xc8b6ff,
    hiddenEdgeColor: 0x000000,
    kernelSize: KernelSize.SMALL,
    blendFunction: BlendFunction.ALPHA,
    width: undefined,
    height: undefined,
    patternTexture: undefined,
  };

  const toyOutlineSettings = {
    enabled: true,
    blur: false,
    xRay: false,
    edgeStrength: 2.0,
    pulseSpeed: 0,
    visibleEdgeColor: 0x9ca3af,
    hiddenEdgeColor: 0x000000,
    kernelSize: KernelSize.SMALL,
    blendFunction: BlendFunction.ALPHA,
    width: undefined,
    height: undefined,
    patternTexture: undefined,
  };

  const outlineSettings =
    outlineKind === "inactive"
      ? inactiveOutlineSettings
      : outlineKind === "toy"
        ? toyOutlineSettings
        : activeOutlineSettings;

  return (
    <div className="ocean">
      <header className="site-header">
        <Breadcrumbs zoneKey={zoneKey} />
        <h1 className="site-title">{title}</h1>
        <p className="site-subtitle">{subtitle}</p>
      </header>

      <div className="map-wrap" style={wrapStyle}>
        <Canvas
          camera={{ fov: 50 }}
          style={{
            width: "100%",
            height: "100%",
            opacity: cameraReady ? 1 : 0,
          }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 3]} intensity={1.0} castShadow />
          <directionalLight
            position={[-3, 2, -4]}
            intensity={0.2}
            color="#88aaff"
          />
          <Environment preset={environmentPreset} />
          {extras}
          <Suspense fallback={<LoadingFallback />}>
            <ZoneMesh
              glbPath={glbPath}
              onNavigate={navigateWithTransition}
              onComingSoon={setComingSoon}
              onSceneReady={setLoadedScene}
              onHoverChange={onHoverChange}
              onToyHoverChange={onToyHoverChange}
              allMeshesRef={allMeshesRef}
            />
          </Suspense>
          <OrbitControls
            ref={orbitRef}
            enablePan={true}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }}
            maxPolarAngle={Math.PI / 2.1}
          />
          <CameraRig
            orbitRef={orbitRef}
            scene={loadedScene}
            cameraOptions={cameraOptions}
            turntableToggleRef={turntableToggleRef}
            onPlayingChange={onPlayingChange}
            onCameraReady={setCameraReady}
          />
          <EffectComposer multisampling={0} autoClear={false}>
            <OutlineController
              selectedObjects={outlinedObjects}
              settings={outlineSettings}
            />
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

      {comingSoon && (
        <div className="modal-overlay" onClick={() => setComingSoon(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-tag">⚑ COMING SOON</div>
            <h2 className="modal-name">{comingSoon}</h2>
            <p className="modal-text">
              This zone is still under construction. Check back later.
            </p>
            <button className="modal-close" onClick={() => setComingSoon(null)}>
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
