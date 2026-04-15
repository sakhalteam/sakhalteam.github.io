import {
  Environment,
  Html,
  OrbitControls,
  useAnimations,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
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
import { BloomDriver, collectMeshes, BLOOM_COLOR_ACTIVE } from "./BloomDriver";
import { useAutoFitCamera } from "./useAutoFitCamera";
import { useKeyboardControls } from "./useKeyboardControls";
import { useOptimizedGLTF } from "./useOptimizedGLTF";
import { useTurntable } from "./useTurntable";
import { useSceneTransition } from "./useSceneTransition";
import { getPortalConfig } from "./sceneMap";
import ToyInteractor from "./ToyInteractor";
import Breadcrumbs from "./Breadcrumbs";

function toTitleCase(str: string) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Hotspot {
  name: string;
  key: string;
  box: THREE.Box3;
  center: THREE.Vector3;
  label: string;
  url: string | null;
  internal: boolean;
  sceneObj: THREE.Object3D;
  meshes: THREE.Mesh[];
}

const HotspotHitbox = memo(function HotspotHitbox({
  hotspot,
  onNavigate,
  onHoverChange,
}: {
  hotspot: Hotspot;
  onNavigate: (url: string, internal: boolean) => void;
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
 * Build hotspots from a zone GLB scene, collecting portal_/zone_ objects
 * and associating zc_/pc_ (child) meshes for glow membership.
 */
function buildHotspots(scene: THREE.Object3D): Hotspot[] {
  const hotspotObjects: THREE.Object3D[] = [];
  const hotspotKeys: string[] = [];
  const hotspotTypes: ("portal" | "zone")[] = [];
  const seen = new Set<string>();

  // Pass 1: find portal_/zone_ objects (traverse handles size_all wrappers or any nesting)
  scene.traverse((obj) => {
    const lower = obj.name.toLowerCase();

    if (lower.startsWith("portal_")) {
      const key = lower.replace(/^portal_/, "");
      if (seen.has(key)) return;
      seen.add(key);
      hotspotObjects.push(obj);
      hotspotKeys.push(key);
      hotspotTypes.push("portal");
    } else if (lower.startsWith("zone_")) {
      const key = lower.replace(/^zone_/, "");
      if (seen.has(key)) return;
      seen.add(key);
      hotspotObjects.push(obj);
      hotspotKeys.push(key);
      hotspotTypes.push("zone");
    }
  });

  // Sort keys longest-first for unambiguous zc_/pc_ matching
  const sortedKeys = [...hotspotKeys].sort((a, b) => b.length - a.length);

  // Pass 2: collect zc_/pc_ meshes and associate with their parent
  const childMap = new Map<string, THREE.Mesh[]>(
    hotspotKeys.map((k) => [k, []]),
  );
  for (const child of scene.children) {
    const lower = child.name.toLowerCase();
    if (!lower.startsWith("zc_") && !lower.startsWith("pc_")) continue;
    const suffix = lower.slice(3); // strip prefix
    for (const key of sortedKeys) {
      if (suffix.startsWith(key + "_") || suffix === key) {
        collectMeshes(child).forEach((m) => childMap.get(key)!.push(m));
        break;
      }
    }
  }

  // Build hotspots
  const result: Hotspot[] = [];
  for (let i = 0; i < hotspotObjects.length; i++) {
    const obj = hotspotObjects[i];
    const key = hotspotKeys[i];
    const type = hotspotTypes[i];
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const objMeshes = collectMeshes(obj);
    const childMeshes = childMap.get(key) ?? [];
    const allMeshes = [...objMeshes, ...childMeshes];

    if (type === "portal") {
      const entry = getPortalConfig(key);
      result.push({
        name: obj.name,
        key,
        box,
        center,
        label: entry?.label ?? toTitleCase(key),
        url: entry?.url ?? null,
        internal: false,
        sceneObj: obj,
        meshes: allMeshes,
      });
    } else {
      result.push({
        name: obj.name,
        key,
        box,
        center,
        label: toTitleCase(key),
        url: `/zone-${key.replace(/_/g, "-")}`,
        internal: true,
        sceneObj: obj,
        meshes: allMeshes,
      });
    }
  }

  return result;
}

function ZoneMesh({
  glbPath,
  onNavigate,
  onSceneReady,
  onHoverChange,
  allMeshesRef,
}: {
  glbPath: string;
  onNavigate: (url: string, internal: boolean) => void;
  onSceneReady: (scene: THREE.Object3D) => void;
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void;
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
      <ToyInteractor scene={scene} />
      {hotspots.map((hotspot) => (
        <HotspotHitbox
          key={hotspot.name}
          hotspot={hotspot}
          onNavigate={onNavigate}
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
  cameraOptions?: { padding?: number; elevation?: number; azimuth?: number };
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
  camera?: { padding?: number; elevation?: number; azimuth?: number };
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
}

export default function ZoneScene({
  glbPath,
  zoneKey,
  title,
  subtitle = "click on things to explore",
  camera: cameraOptions,
  environmentPreset = "night",
}: ZoneSceneProps) {
  const orbitRef = useRef<any>(null);
  const turntableToggleRef = useRef<(() => void) | null>(null);
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [hoveredHotspot, setHoveredHotspot] = useState<Hotspot | null>(null);
  const [turntablePlaying, setTurntablePlaying] = useState(true);

  const { navigateWithTransition, wrapStyle } = useSceneTransition(cameraReady);

  const onHoverChange = useCallback((hotspot: Hotspot, hovered: boolean) => {
    setHoveredHotspot(hovered ? hotspot : null);
  }, []);

  const onPlayingChange = useCallback((playing: boolean) => {
    setTurntablePlaying(playing);
  }, []);

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
          <Suspense fallback={<LoadingFallback />}>
            <ZoneMesh
              glbPath={glbPath}
              onNavigate={navigateWithTransition}
              onSceneReady={setLoadedScene}
              onHoverChange={onHoverChange}
              allMeshesRef={allMeshesRef}
            />
            <BloomDriver
              allMeshes={allMeshesRef}
              hoveredMeshes={hoveredHotspot?.meshes ?? []}
              color={BLOOM_COLOR_ACTIVE}
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
          <EffectComposer multisampling={0}>
            <Bloom
              intensity={0.2}
              luminanceThreshold={0.85}
              luminanceSmoothing={0.3}
              kernelSize={KernelSize.SMALL}
              mipmapBlur
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
    </div>
  );
}
