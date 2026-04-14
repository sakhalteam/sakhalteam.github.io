import { Suspense, useRef, useMemo, useState, useCallback, useEffect, memo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
import { useOptimizedGLTF } from './useOptimizedGLTF'
import { useKeyboardControls } from './useKeyboardControls'
import { useTurntable } from './useTurntable'
import { AdaptiveLabel } from './AdaptiveLabel'
import { BloomDriver, collectMeshes, BLOOM_COLOR_ACTIVE, BLOOM_COLOR_COMING_SOON } from './BloomDriver'
import ToyInteractor from './ToyInteractor'
import { isToyUnderPointer } from './toyClickFlag'
import Water from './Water'
import { getZoneConfig } from './sceneMap'
import { startTransition } from './transitionStore'
import * as THREE from 'three'

interface ZoneMarker {
  name: string
  key: string
  box: THREE.Box3          // hitbox — only the zone_ object, no zc_ children
  center: THREE.Vector3
  label: string
  url: string | null
  internal: boolean
  type: 'active' | 'coming-soon'
  sounds?: string[]
  sceneObj: THREE.Object3D
  meshes: THREE.Mesh[]     // bloom glow — includes zone_ + zc_ meshes
}


/**
 * Build zone markers by scanning the scene for zone_/portal_ objects
 * and associating zc_ (zone child) meshes with their parent zones.
 *
 * Convention:
 *   zone_<key>        — clickable zone (hitbox + label + glow source)
 *   zc_<key>_<name>   — glows with zone_<key> on hover, not a trigger itself
 *   portal_<key>      — navigates to a site
 *   (no prefix)       — scenery, no interaction
 */
function buildZoneMarkers(scene: THREE.Object3D): ZoneMarker[] {
  const zoneObjects: THREE.Object3D[] = []
  const zoneKeys: string[] = []

  // Pass 1: find zone_/portal_ objects among scene children
  for (const child of scene.children) {
    const lower = child.name.toLowerCase()
    if (lower.startsWith('zone_') || lower.startsWith('portal_')) {
      zoneObjects.push(child)
      zoneKeys.push(lower.replace(/^(zone|portal)_/, ''))
    }
  }

  // Sort keys longest-first so zc_ matching is unambiguous
  // (e.g. "pokemon_park" matches before "pokemon")
  const sortedKeys = [...zoneKeys].sort((a, b) => b.length - a.length)

  // Pass 2: collect zc_ meshes and associate with their zone
  const zcMap = new Map<string, THREE.Mesh[]>(zoneKeys.map(k => [k, []]))
  for (const child of scene.children) {
    const lower = child.name.toLowerCase()
    if (!lower.startsWith('zc_')) continue
    const suffix = lower.slice(3) // strip 'zc_'
    for (const key of sortedKeys) {
      if (suffix.startsWith(key + '_') || suffix === key) {
        // Collect this object + any mesh descendants
        collectMeshes(child).forEach(m => zcMap.get(key)!.push(m))
        break
      }
    }
  }

  // Build markers with combined meshes and expanded bounding boxes
  const result: ZoneMarker[] = []
  for (const obj of zoneObjects) {
    const key = obj.name.toLowerCase().replace(/^(zone|portal)_/, '')
    const config = getZoneConfig(obj.name)
    const zoneMeshes = collectMeshes(obj)
    const zcMeshes = zcMap.get(key) ?? []
    const allMeshes = [...zoneMeshes, ...zcMeshes]

    // Hitbox covers only the zone_ object itself — NOT zc_ children.
    // This prevents tall objects like cranes from creating huge overlapping hitboxes.
    // The zc_ meshes still glow via the meshes array.
    const box = new THREE.Box3().setFromObject(obj)
    const center = new THREE.Vector3()
    box.getCenter(center)

    result.push({ name: obj.name, key, box, center, sceneObj: obj, meshes: allMeshes, ...config })
  }

  return result
}

/** Audio cache + cycling index for zone click sounds */
const zoneSoundIndex = new Map<string, number>()
const zoneSoundCache = new Map<string, HTMLAudioElement>()
function playZoneSound(marker: ZoneMarker) {
  if (!marker.sounds?.length) return
  const idx = zoneSoundIndex.get(marker.name) ?? 0
  const url = marker.sounds[idx % marker.sounds.length]
  zoneSoundIndex.set(marker.name, idx + 1)
  let audio = zoneSoundCache.get(url)
  if (!audio) {
    audio = new Audio(url)
    audio.volume = 0.5
    zoneSoundCache.set(url, audio)
  }
  audio.currentTime = 0
  audio.play().catch(() => {})
}

/** Cap zone hitbox height to prevent tall objects (e.g. deku tree) from
 *  creating oversized trigger areas that block toy clicks in the canopy. */
const MAX_HITBOX_HEIGHT = 3.0

const ZoneHitbox = memo(function ZoneHitbox({
  marker, onComingSoon, onNavigate, onHoverChange,
}: {
  marker: ZoneMarker
  onComingSoon: (label: string) => void
  onNavigate: (url: string, internal: boolean, center: THREE.Vector3) => void
  onHoverChange: (marker: ZoneMarker, hovered: boolean) => void
}) {
  const [hovered, setHovered] = useState(false)
  const pointerDown = useRef<{ x: number, y: number } | null>(null)
  const { size, center } = useMemo(() => {
    const s = new THREE.Vector3()
    marker.box.getSize(s)
    const c = marker.center.clone()
    // If too tall, shrink hitbox to bottom portion (e.g. tree trunk mouth)
    if (s.y > MAX_HITBOX_HEIGHT) {
      c.y = marker.box.min.y + MAX_HITBOX_HEIGHT / 2
      s.y = MAX_HITBOX_HEIGHT
    }
    return { size: s, center: c }
  }, [marker])

  return (
    <group position={center}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          onHoverChange(marker, true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          onHoverChange(marker, false)
          document.body.style.cursor = 'auto'
        }}
        onPointerDown={(e) => { pointerDown.current = { x: e.clientX, y: e.clientY } }}
        onClick={(e) => {
          e.stopPropagation()
          // If ToyInteractor detected a toy under the cursor on pointerdown, bail —
          // let the toy's click handler (DOM capture phase) handle it instead.
          if (isToyUnderPointer()) return
          if (pointerDown.current) {
            const dx = e.clientX - pointerDown.current.x
            const dy = e.clientY - pointerDown.current.y
            if (dx * dx + dy * dy > 25) return
          }
          if (marker.url) {
            onNavigate(marker.url, marker.internal, marker.center)
          } else {
            playZoneSound(marker)
            onComingSoon(marker.label)
          }
        }}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial visible={false} />
      </mesh>
      <AdaptiveLabel position={[0, size.y / 2 + 0.3, 0]} nearDistance={8} farDistance={25}>
        <div style={{
          background: hovered ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.75)',
          color: hovered
            ? (marker.type === 'active' ? '#ff8a6a' : '#d1d5db')
            : (marker.type === 'active' ? '#e05a3a' : '#9ca3af'),
          padding: hovered ? '3px 12px' : '2px 8px',
          borderRadius: '99px',
          fontSize: hovered ? '12px' : '10px',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
          border: `1px solid ${hovered
            ? (marker.type === 'active' ? 'rgba(224,90,58,0.8)' : 'rgba(255,255,255,0.3)')
            : (marker.type === 'active' ? 'rgba(224,90,58,0.4)' : 'rgba(255,255,255,0.1)')}`,
          boxShadow: hovered
            ? `0 0 12px ${marker.type === 'active' ? 'rgba(224,90,58,0.5)' : 'rgba(150,150,150,0.3)'}`
            : 'none',
          transition: 'all 0.15s ease',
        }}>
          {marker.label}
        </div>
      </AdaptiveLabel>
    </group>
  )
})


function IslandMesh({ onComingSoon, onNavigate, onHoverChange, allMeshesRef, onReady }: {
  onComingSoon: (label: string) => void
  onNavigate: (url: string, internal: boolean, center: THREE.Vector3) => void
  onHoverChange: (marker: ZoneMarker, hovered: boolean) => void
  allMeshesRef: React.RefObject<Map<string, THREE.Mesh[]>>
  onReady?: () => void
}) {
  const { scene, animations } = useOptimizedGLTF('/island.glb')

  useEffect(() => { onReady?.() }, [scene, onReady])

  const markers = useMemo(() => {
    const result = buildZoneMarkers(scene)
    for (const marker of result) {
      allMeshesRef.current.set(marker.name, marker.meshes)
    }
    return result
  }, [scene, allMeshesRef])

  return (
    <>
      <primitive object={scene} />
      <ToyInteractor scene={scene} animations={animations} />
      {markers.map((marker) => (
        <ZoneHitbox key={marker.name} marker={marker} onComingSoon={onComingSoon} onNavigate={onNavigate} onHoverChange={onHoverChange} />
      ))}
    </>
  )
}

function LoadingFallback() {
  return (
    <Html center>
      <span style={{ color: '#6b7280', fontSize: '12px', letterSpacing: '0.1em' }}>
        LOADING...
      </span>
    </Html>
  )
}

/** Smoothly dollies camera toward a target position when set */
function CameraDolly({ target, orbitRef }: {
  target: THREE.Vector3 | null
  orbitRef: React.RefObject<any>
}) {
  const init = useRef<{
    camPos: THREE.Vector3
    orbTarget: THREE.Vector3
    elapsed: number
  } | null>(null)

  useEffect(() => { init.current = null }, [target])

  useFrame(({ camera }, delta) => {
    if (!target || !orbitRef.current) return

    if (!init.current) {
      init.current = {
        camPos: camera.position.clone(),
        orbTarget: orbitRef.current.target.clone(),
        elapsed: 0,
      }
      orbitRef.current.enabled = false
    }

    const s = init.current
    s.elapsed += delta
    const t = Math.min(s.elapsed / 1.0, 1) // 1s dolly duration
    const eased = 1 - Math.pow(1 - t, 2)   // ease-out quadratic — fast start, visible immediately

    // Fly toward zone center, stay a bit above it
    const endPos = target.clone()
    endPos.y += 2.5
    camera.position.lerpVectors(s.camPos, endPos, eased * 0.6)

    // Orbit target tracks the zone center
    orbitRef.current.target.lerpVectors(s.orbTarget, target, eased * 0.7)
    orbitRef.current.update()
  })

  return null
}

/** Keyboard controls + turntable for the island view */
function IslandCameraRig({ orbitRef, turntableToggleRef, onPlayingChange }: {
  orbitRef: React.RefObject<any>
  turntableToggleRef: React.RefObject<(() => void) | null>
  onPlayingChange: (playing: boolean) => void
}) {
  const { stop, toggle, playing } = useTurntable(orbitRef)
  useKeyboardControls(orbitRef, { onInteract: stop })

  turntableToggleRef.current = toggle

  useEffect(() => {
    onPlayingChange(playing)
  }, [playing, onPlayingChange])

  return null
}


interface Props {
  style?: React.CSSProperties
  onComingSoon: (label: string) => void
  onTurntableChange?: (toggle: () => void, playing: boolean) => void
  onReady?: () => void
}

export default function IslandScene({ style, onComingSoon, onTurntableChange, onReady }: Props) {
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map())
  const orbitRef = useRef<any>(null)
  const turntableToggleRef = useRef<(() => void) | null>(null)
  const [hoveredZone, setHoveredZone] = useState<ZoneMarker | null>(null)
  const [dollyTarget, setDollyTarget] = useState<THREE.Vector3 | null>(null)

  const handleNavigate = useCallback((url: string, internal: boolean, center: THREE.Vector3) => {
    setDollyTarget(center)
    // Brief camera dolly visible before clouds slide in
    setTimeout(() => startTransition(url, internal), 300)
  }, [])

  const onHoverChange = useCallback((marker: ZoneMarker, hovered: boolean) => {
    setHoveredZone(hovered ? marker : null)
  }, [])

  const onPlayingChange = useCallback((playing: boolean) => {
    if (onTurntableChange && turntableToggleRef.current) {
      onTurntableChange(turntableToggleRef.current, playing)
    }
  }, [onTurntableChange])

  const bloomColor = hoveredZone?.type === 'active' ? BLOOM_COLOR_ACTIVE : BLOOM_COLOR_COMING_SOON

  return (
    <Canvas
      camera={{ position: [0, 8, 14], fov: 40 }}
      style={style}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[6, 10, 4]} intensity={1.2} castShadow />
      <directionalLight position={[-4, 3, -6]} intensity={0.3} color="#4488ff" />
      <Environment preset="night" />
      <Water />
      <Suspense fallback={<LoadingFallback />}>
        <IslandMesh onComingSoon={onComingSoon} onNavigate={handleNavigate} onHoverChange={onHoverChange} allMeshesRef={allMeshesRef} onReady={onReady} />
        <BloomDriver
          allMeshes={allMeshesRef}
          hoveredMeshes={hoveredZone?.meshes ?? []}
          color={bloomColor}
        />
      </Suspense>
      <OrbitControls
        ref={orbitRef}
        enablePan={true}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
      />
      <IslandCameraRig orbitRef={orbitRef} turntableToggleRef={turntableToggleRef} onPlayingChange={onPlayingChange} />
      <CameraDolly target={dollyTarget} orbitRef={orbitRef} />
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
  )
}

useOptimizedGLTF.preload('/island.glb')
