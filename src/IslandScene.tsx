// IslandScene.tsx

import { Environment, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
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
import { playCyclingSound } from "./audio";
import { useDebugHitboxes } from "./debugFlags";
import IdleAnimator from "./IdleAnimator";
import { collectMeshes } from "./meshUtils";
import OutlineController from "./Outline";
import { OUTLINE_STYLES, type OutlineKind } from "./outlineStyles";
import { computeOwnBounds } from "./ownBounds";
import { findNodeByObjectName, getZoneConfig, sceneMap } from "./sceneMap";
import { isToyUnderPointer } from "./toyClickFlag";
import ToyInteractor from "./ToyInteractor";
import { startTransition } from "./transitionStore";
import { useCameraReset } from "./useCameraReset";
import { useFocusOrbit } from "./useFocusOrbit";
import { useKeyboardControls } from "./useKeyboardControls";
import { useLightingControls } from "./useLightingControls";
import { useOptimizedGLTF } from "./useOptimizedGLTF";
import { useTurntable } from "./useTurntable";
import Water from "./Water";
import Whirlpool from "./Whirlpool";

/**
 * Disabler for Blender-imported lights. Blender Lighting addons (e.g.
 * Tri-Lighting) can dump dozens of area/point lights into a GLB; if any
 * slip into the export they cause whiteout. We log + zero them so the
 * authoritative lighting comes purely from `<IslandLighting>` below.
 */
function BlenderLightDisabler({ scene }: { scene: THREE.Object3D }) {
  useEffect(() => {
    const found: string[] = [];
    scene.traverse((obj) => {
      const l = obj as THREE.Light;
      if (l.isLight) {
        const type = obj.constructor.name;
        const name = obj.name || "(unnamed)";
        const intensity = (l as { intensity?: number }).intensity ?? 0;
        found.push(`${type}: ${name} @ ${intensity.toFixed(2)}`);
        (l as { intensity?: number }).intensity = 0;
      }
    });
    if (found.length) {
      console.log(
        `[BlenderLights] disabled ${found.length} imported light(s) in island.glb:`,
        found,
      );
    }
  }, [scene]);

  return null;
}

/**
 * IslandScene lighting. Schema and defaults live in useLightingControls —
 * shared with every non-atmosphere zone so each scene gets the same
 * panel and per-scope persistence. The hook's LIGHTING_DEFAULTS is the
 * 4/22 baseline (the last known-good Animal-Crossing-y state).
 */
function IslandLighting() {
  const {
    envPreset,
    envIntensity,
    sunIntensity,
    sunColor,
    sunX,
    sunY,
    sunZ,
    fillIntensity,
    fillColor,
    ambientIntensity,
  } = useLightingControls("island", "src/IslandScene.tsx → IslandLighting()");

  const { gl } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  return (
    <>
      <Environment
        preset={envPreset as never}
        environmentIntensity={envIntensity}
        background={false}
      />
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        position={[sunX, sunY, sunZ]}
        intensity={sunIntensity}
        color={sunColor}
        castShadow
      />
      <directionalLight
        position={[-4, 3, -6]}
        intensity={fillIntensity}
        color={fillColor}
      />
    </>
  );
}

interface ZoneMarker {
  name: string;
  key: string;
  box: THREE.Box3; // hitbox — only the zone_ object, no zc_ children
  center: THREE.Vector3;
  label: string;
  url: string | null;
  internal: boolean;
  type: "active" | "coming-soon";
  sounds?: string[];
  sceneObj: THREE.Object3D;
  meshes: THREE.Mesh[]; // bloom glow — includes zone_ + zc_ meshes
  labelOffsetY: number;
  focusDistance?: number;
  focusBehavior?: "fit" | "instant";
}

/**
 * Build zone markers by scanning the scene for zone_/portal_ objects and
 * grouping toy meshes by sceneMap `parent`. No prefix heuristics.
 *
 * Convention:
 *   zone_<key>                 clickable zone (hitbox + label + glow source)
 *   portal_<key>                navigates to a site
 *   <zone_name>_hitbox          optional click collider — overrides bbox and is hidden
 *   toys with sceneMap.parent   glow with their parent zone/portal on hover
 */
function buildZoneMarkers(scene: THREE.Object3D): ZoneMarker[] {
  // Pass 1: find zone_/portal_ objects at scene root + locate any _hitbox colliders.
  const zoneObjects: THREE.Object3D[] = [];
  const hitboxMap = new Map<string, THREE.Object3D>();

  for (const child of scene.children) {
    const lower = child.name.toLowerCase();
    if (lower.endsWith("_hitbox")) continue;
    if (
      lower.endsWith("_flight_start") ||
      lower.endsWith("_flight_end") ||
      lower.endsWith("_flight_finish")
    )
      continue;
    if (lower.startsWith("zone_") || lower.startsWith("portal_")) {
      zoneObjects.push(child);
    }
  }

  scene.traverse((obj) => {
    const lower = obj.name.toLowerCase();
    if (lower.endsWith("_hitbox")) {
      const target = lower.slice(0, -"_hitbox".length);
      hitboxMap.set(target, obj);
    }
  });

  // Pass 2: group toy meshes by their sceneMap parent key.
  const toysByParent = new Map<string, THREE.Mesh[]>();
  scene.traverse((obj) => {
    if (!obj.name) return;
    const node = sceneMap.get(obj.name.toLowerCase());
    if (!node || node.type !== "toy" || !node.parent) return;
    const list = toysByParent.get(node.parent) ?? [];
    list.push(...collectMeshes(obj));
    toysByParent.set(node.parent, list);
  });

  // Pass 3: build markers.
  const result: ZoneMarker[] = [];
  for (const obj of zoneObjects) {
    const lower = obj.name.toLowerCase();
    const key = lower.replace(/^(zone|portal)_/, "");
    const canonicalKey = findNodeByObjectName(obj.name)?.key ?? key;
    const config = getZoneConfig(obj.name);

    const zoneMeshes = collectMeshes(obj);
    const memberMeshes = toysByParent.get(canonicalKey) ?? [];

    const hitboxObj = hitboxMap.get(lower) ?? hitboxMap.get(key);
    let box: THREE.Box3;
    if (hitboxObj) {
      box = new THREE.Box3().setFromObject(hitboxObj);
      hitboxObj.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).visible = false;
      });
    } else {
      // Excludes Blender-parented descendants that have their own sceneMap
      // entry (e.g. blue jay parented to the eagle) so they don't bloat
      // the parent's click hitbox.
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
      sceneObj: obj,
      meshes: [...zoneMeshes, ...memberMeshes],
      labelOffsetY: node?.labelOffsetY ?? 0,
      focusDistance: node?.focusDistance,
      focusBehavior: node?.focusBehavior,
      ...config,
    });
  }

  return result;
}

function playZoneSound(marker: ZoneMarker) {
  if (!marker.sounds?.length) return;
  playCyclingSound(marker.name, marker.sounds, 0.5);
}

const ZoneHitbox = memo(function ZoneHitbox({
  marker,
  onComingSoon,
  onNavigate,
  onHoverChange,
  onFocus,
  isFocused,
}: {
  marker: ZoneMarker;
  onComingSoon: (label: string) => void;
  onNavigate: (url: string, internal: boolean, center: THREE.Vector3) => void;
  onHoverChange: (marker: ZoneMarker, hovered: boolean) => void;
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
  const { size, center, focusRadius } = useMemo(() => {
    const s = new THREE.Vector3();
    marker.box.getSize(s);
    return {
      size: s,
      center: marker.center.clone(),
      focusRadius: s.length() / 2,
    };
  }, [marker]);
  const focusOpts = useMemo(
    () => ({
      distance: marker.focusDistance,
      behavior: marker.focusBehavior,
    }),
    [marker.focusDistance, marker.focusBehavior],
  );

  return (
    <group position={center}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange(marker, true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          onHoverChange(marker, false);
          document.body.style.cursor = "auto";
        }}
        onPointerDown={(e) => {
          pointerDown.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          e.stopPropagation();
          // If ToyInteractor detected a toy under the cursor on pointerdown, bail —
          // let the toy's click handler (DOM capture phase) handle it instead.
          if (isToyUnderPointer()) return;
          if (pointerDown.current) {
            const dx = e.clientX - pointerDown.current.x;
            const dy = e.clientY - pointerDown.current.y;
            if (dx * dx + dy * dy > 25) return;
          }
          if (!isFocused(marker.center, marker.key)) {
            onFocus(marker.center, marker.key, focusRadius, focusOpts);
            // For "instant" behavior, fall through to fire the action this
            // same click instead of waiting for a second one.
            if (focusOpts.behavior !== "instant") return;
          }
          if (marker.url) {
            onNavigate(marker.url, marker.internal, marker.center);
          } else {
            playZoneSound(marker);
            onComingSoon(marker.label);
          }
        }}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        {debugHitboxes ? (
          <meshBasicMaterial
            color={marker.type === "active" ? "#ff7055" : "#8a6ac0"}
            wireframe
            transparent
            opacity={0.6}
          />
        ) : (
          <meshStandardMaterial visible={false} />
        )}
      </mesh>
      <AdaptiveLabel
        position={[0, size.y / 2 + 0.3 + marker.labelOffsetY, 0]}
        nearDistance={8}
        farDistance={25}
      >
        <div
          style={{
            background: hovered ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.75)",
            color: hovered
              ? marker.type === "active"
                ? "#ff8a6a"
                : "#d1d5db"
              : marker.type === "active"
                ? "#e05a3a"
                : "#9ca3af",
            padding: hovered ? "3px 12px" : "2px 8px",
            borderRadius: "99px",
            fontSize: hovered ? "12px" : "10px",
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            border: `1px solid ${
              hovered
                ? marker.type === "active"
                  ? "rgba(224,90,58,0.8)"
                  : "rgba(255,255,255,0.3)"
                : marker.type === "active"
                  ? "rgba(224,90,58,0.4)"
                  : "rgba(255,255,255,0.1)"
            }`,
            boxShadow: hovered
              ? `0 0 12px ${marker.type === "active" ? "rgba(224,90,58,0.5)" : "rgba(150,150,150,0.3)"}`
              : "none",
            transition: "all 0.15s ease",
          }}
        >
          {marker.label}
        </div>
      </AdaptiveLabel>
    </group>
  );
});

function IslandMesh({
  onComingSoon,
  onNavigate,
  onHoverChange,
  onToyHoverChange,
  onFocus,
  isFocused,
  allMeshesRef,
  onReady,
}: {
  onComingSoon: (label: string) => void;
  onNavigate: (url: string, internal: boolean, center: THREE.Vector3) => void;
  onHoverChange: (marker: ZoneMarker, hovered: boolean) => void;
  onToyHoverChange: (objects: THREE.Object3D[], hovered: boolean) => void;
  onFocus: (
    point: THREE.Vector3,
    id?: string,
    radius?: number,
    opts?: { distance?: number; behavior?: "fit" | "instant" },
  ) => void;
  isFocused: (point: THREE.Vector3, id?: string) => boolean;
  allMeshesRef: React.RefObject<Map<string, THREE.Mesh[]>>;
  onReady?: () => void;
}) {
  const { scene, animations } = useOptimizedGLTF("/island.glb");

  useEffect(() => {
    onReady?.();
  }, [scene, onReady]);

  const markers = useMemo(() => {
    const result = buildZoneMarkers(scene);
    for (const marker of result) {
      allMeshesRef.current.set(marker.name, marker.meshes);
    }
    return result;
  }, [scene, allMeshesRef]);

  return (
    <>
      <primitive object={scene} />
      <BlenderLightDisabler scene={scene} />
      <IdleAnimator scene={scene} />
      <ToyInteractor
        scene={scene}
        animations={animations}
        onHoverChange={onToyHoverChange}
        onFocus={onFocus}
      />
      {markers.map((marker) => (
        <ZoneHitbox
          key={marker.name}
          marker={marker}
          onComingSoon={onComingSoon}
          onNavigate={onNavigate}
          onHoverChange={onHoverChange}
          onFocus={onFocus}
          isFocused={isFocused}
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

/** Smoothly dollies camera toward a target position when set */
function CameraDolly({
  target,
  orbitRef,
}: {
  target: THREE.Vector3 | null;
  orbitRef: React.RefObject<any>;
}) {
  const init = useRef<{
    camPos: THREE.Vector3;
    orbTarget: THREE.Vector3;
    elapsed: number;
  } | null>(null);

  useEffect(() => {
    init.current = null;
  }, [target]);

  useFrame(({ camera }, delta) => {
    if (!target || !orbitRef.current) return;

    if (!init.current) {
      init.current = {
        camPos: camera.position.clone(),
        orbTarget: orbitRef.current.target.clone(),
        elapsed: 0,
      };
      orbitRef.current.enabled = false;
    }

    const s = init.current;
    s.elapsed += delta;
    const t = Math.min(s.elapsed / 1.0, 1); // 1s dolly duration
    const eased = 1 - Math.pow(1 - t, 2); // ease-out quadratic — fast start, visible immediately

    // Fly toward zone center, stay a bit above it
    const endPos = target.clone();
    endPos.y += 2.5;
    camera.position.lerpVectors(s.camPos, endPos, eased * 0.6);

    // Orbit target tracks the zone center
    orbitRef.current.target.lerpVectors(s.orbTarget, target, eased * 0.7);
    orbitRef.current.update();
  });

  return null;
}

/** Keyboard controls + turntable for the island view */
function IslandCameraRig({
  orbitRef,
  turntableToggleRef,
  onPlayingChange,
}: {
  orbitRef: React.RefObject<any>;
  turntableToggleRef: React.RefObject<(() => void) | null>;
  onPlayingChange: (playing: boolean) => void;
}) {
  const { stop, toggle, playing } = useTurntable(orbitRef);
  useKeyboardControls(orbitRef, { onInteract: stop });

  turntableToggleRef.current = toggle;

  useEffect(() => {
    onPlayingChange(playing);
  }, [playing, onPlayingChange]);

  useCameraReset(orbitRef, true);

  return null;
}

interface Props {
  style?: React.CSSProperties;
  onComingSoon: (label: string) => void;
  onTurntableChange?: (toggle: () => void, playing: boolean) => void;
  onReady?: () => void;
}

export default function IslandScene({
  style,
  onComingSoon,
  onTurntableChange,
  onReady,
}: Props) {
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map());
  const orbitRef = useRef<any>(null);
  const turntableToggleRef = useRef<(() => void) | null>(null);
  const [outlinedObjects, setOutlinedObjects] = useState<THREE.Object3D[]>([]);
  const [outlineKind, setOutlineKind] = useState<OutlineKind>("active");
  const [dollyTarget, setDollyTarget] = useState<THREE.Vector3 | null>(null);
  const { focus: focusOrbitTarget, isFocused } = useFocusOrbit(orbitRef);

  // Shared world position for the whirlpool so Water can carve a funnel underneath it.
  const whirlpoolCenterRef = useRef<THREE.Vector3>(
    new THREE.Vector3(15, 0.08, 0),
  );
  const handleNavigate = useCallback(
    (url: string, internal: boolean, center: THREE.Vector3) => {
      setDollyTarget(center);
      // Brief camera dolly visible before clouds slide in
      setTimeout(() => startTransition(url, internal), 300);
    },
    [],
  );

  const onHoverChange = useCallback((marker: ZoneMarker, hovered: boolean) => {
    setOutlinedObjects(hovered ? marker.meshes : []);
    setOutlineKind(
      hovered ? (marker.type === "active" ? "active" : "inactive") : "active",
    );
  }, []);

  const onToyHoverChange = useCallback(
    (objects: THREE.Object3D[], hovered: boolean) => {
      setOutlinedObjects(hovered ? objects : []);
      setOutlineKind(hovered ? "toy" : "active");
    },
    [],
  );

  const onPlayingChange = useCallback(
    (playing: boolean) => {
      if (onTurntableChange && turntableToggleRef.current) {
        onTurntableChange(turntableToggleRef.current, playing);
      }
    },
    [onTurntableChange],
  );

  const outlineSettings = OUTLINE_STYLES[outlineKind];

  return (
    <Canvas
      camera={{ position: [0, 8, 14], fov: 80 }}
      style={style}
      gl={{ antialias: true, alpha: true }}
    >
      {/* All scene lighting lives in IslandLighting — env preset, sun, ambient,
          tone-map exposure. Tune via the leva panel in the top-right corner. */}
      <IslandLighting />
      <Water
        funnelCenter={whirlpoolCenterRef}
        size={80}
        color="#00fccd"
        opacity={0.34}
        shallowColor="#9cebd9"
        deepColor="#1c93bd"
        surfaceBoost={0.58}
        foamBoost={0.75}
        waveSpeed={0.9}
        foamSpeed={0.1}
        foamScale={14}
        waveScale={5}
        rimWidth={0.6}
        rimColor="#ffffff"
        rimStrength={0.95}
      />
      <Whirlpool centerRef={whirlpoolCenterRef} />
      <Suspense fallback={<LoadingFallback />}>
        <IslandMesh
          onComingSoon={onComingSoon}
          onNavigate={handleNavigate}
          onHoverChange={onHoverChange}
          onToyHoverChange={onToyHoverChange}
          onFocus={focusOrbitTarget}
          isFocused={isFocused}
          allMeshesRef={allMeshesRef}
          onReady={onReady}
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
        minDistance={2}
        maxDistance={50}
        zoomSpeed={2}
      />
      <IslandCameraRig
        orbitRef={orbitRef}
        turntableToggleRef={turntableToggleRef}
        onPlayingChange={onPlayingChange}
      />
      <CameraDolly target={dollyTarget} orbitRef={orbitRef} />
      <EffectComposer multisampling={0} autoClear={false}>
        <OutlineController
          selectedObjects={outlinedObjects}
          settings={outlineSettings}
        />
      </EffectComposer>
    </Canvas>
  );
}

useOptimizedGLTF.preload("/island.glb");
