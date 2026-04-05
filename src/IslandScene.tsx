import { Suspense, useRef, useMemo, useState, useCallback, memo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
import { useOptimizedGLTF } from './useOptimizedGLTF'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'

interface ZoneConfig {
  label: string
  url: string | null
  internal: boolean
  type: 'active' | 'coming-soon'
}

function toTitleCase(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const ZONE_LABELS: Record<string, string> = {
  ss_brainfog: 'S.S. Brainfog',
}

const ZONE_URLS: Record<string, { url: string, internal: boolean }> = {
  bird_sanctuary: { url: '/zone-bird-sanctuary', internal: true },
  ss_brainfog: { url: '/zone-ss-brainfog', internal: true },
  cloud_town: { url: '/zone-cloud-town', internal: true },
  tower_of_knowledge: { url: '/zone-tower-of-knowledge', internal: true },
  pokemon_island: { url: '/zone-pokemon-island', internal: true },
  family_mart: { url: '/zone-family-mart', internal: true },
  beach_party: { url: '/zone-beach-party', internal: true },
}

function getZoneConfig(meshName: string): ZoneConfig {
  const key = meshName.replace(/^(zone|portal)_/i, '').toLowerCase()
  const entry = ZONE_URLS[key]
  const label = ZONE_LABELS[key] ?? toTitleCase(key)
  return { label, url: entry?.url ?? null, internal: entry?.internal ?? false, type: entry ? 'active' : 'coming-soon' }
}

interface ZoneMarker {
  name: string
  key: string
  box: THREE.Box3
  center: THREE.Vector3
  label: string
  url: string | null
  internal: boolean
  type: 'active' | 'coming-soon'
  sceneObj: THREE.Object3D
  meshes: THREE.Mesh[]
}

/** Collect all Mesh descendants of an Object3D (including itself if it's a mesh) */
function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
  })
  return meshes
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

    // Bounding box covers zone object + all zc_ children
    const box = new THREE.Box3().setFromObject(obj)
    for (const mesh of zcMeshes) box.expandByObject(mesh)
    const center = new THREE.Vector3()
    box.getCenter(center)

    result.push({ name: obj.name, key, box, center, sceneObj: obj, meshes: allMeshes, ...config })
  }

  return result
}

const ZoneHitbox = memo(function ZoneHitbox({
  marker, onComingSoon, navigate, onHoverChange,
}: {
  marker: ZoneMarker
  onComingSoon: (label: string) => void
  navigate: (path: string) => void
  onHoverChange: (marker: ZoneMarker, hovered: boolean) => void
}) {
  const [hovered, setHovered] = useState(false)
  const pointerDown = useRef<{ x: number, y: number } | null>(null)
  const size = useMemo(() => {
    const s = new THREE.Vector3()
    marker.box.getSize(s)
    return s
  }, [marker.box])

  return (
    <group position={marker.center}>
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
          if (pointerDown.current) {
            const dx = e.clientX - pointerDown.current.x
            const dy = e.clientY - pointerDown.current.y
            if (dx * dx + dy * dy > 25) return
          }
          if (marker.url) {
            if (marker.internal) {
              navigate(marker.url)
            } else {
              window.location.href = marker.url
            }
          } else {
            onComingSoon(marker.label)
          }
        }}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial visible={false} />
      </mesh>
      <Html center distanceFactor={12} position={[0, size.y / 2 + 0.3, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
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
      </Html>
    </group>
  )
})

/**
 * Drives emissive bloom on ALL zone meshes.
 * Iterates every registered mesh each frame — boosts hovered ones, restores the rest.
 */
function BloomDriver({ allMeshes, hoveredMeshes, color }: {
  allMeshes: React.RefObject<Map<string, THREE.Mesh[]>>
  hoveredMeshes: THREE.Mesh[]
  color: THREE.Color
}) {
  // Track per-MESH (not per-material) to handle shared materials like cranes
  const originals = useRef<Map<THREE.Mesh, { emissive: THREE.Color, emissiveIntensity: number }>>(new Map())
  const intensities = useRef<Map<THREE.Mesh, number>>(new Map())
  const hoveredSet = useRef<Set<THREE.Mesh>>(new Set())
  const activeColor = useRef(color)

  hoveredSet.current = new Set(hoveredMeshes)
  activeColor.current = color

  useFrame((_, delta) => {
    for (const [, meshes] of allMeshes.current) {
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (!mat.emissive) continue

        // On first encounter, clone shared materials so each mesh is independent
        if (!originals.current.has(mesh)) {
          if (!mesh.userData._bloomCloned) {
            mesh.material = mat.clone()
            mesh.userData._bloomCloned = true
          }
          const cloned = mesh.material as THREE.MeshStandardMaterial
          originals.current.set(mesh, {
            emissive: cloned.emissive.clone(),
            emissiveIntensity: cloned.emissiveIntensity,
          })
          intensities.current.set(mesh, 0)
        }

        const target = hoveredSet.current.has(mesh) ? 1.0 : 0.0
        let curr = intensities.current.get(mesh)!
        const diff = Math.abs(curr - target)

        if (diff < 0.001) {
          if (curr !== target) {
            curr = target
            intensities.current.set(mesh, curr)
          }
          if (curr === 0) {
            const orig = originals.current.get(mesh)!
            mat.emissive.copy(orig.emissive)
            mat.emissiveIntensity = orig.emissiveIntensity
          }
          continue
        }

        curr = THREE.MathUtils.lerp(curr, target, delta * 8)
        intensities.current.set(mesh, curr)

        const orig = originals.current.get(mesh)!
        mat.emissive.copy(orig.emissive).lerp(activeColor.current, curr)
        mat.emissiveIntensity = orig.emissiveIntensity + curr * 0.15
      }
    }
  })

  return null
}

/**
 * Gently bobs toy_ objects in the scene (e.g. Lapras floating in water).
 * Finds all toy_ prefixed objects and applies a sine-wave Y offset.
 */
function ToyAnimator({ scene }: { scene: THREE.Object3D }) {
  const toys = useMemo(() => {
    const result: { obj: THREE.Object3D, baseY: number }[] = []
    for (const child of scene.children) {
      if (child.name.toLowerCase().startsWith('toy_')) {
        result.push({ obj: child, baseY: child.position.y })
      }
    }
    return result
  }, [scene])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    for (const { obj, baseY } of toys) {
      obj.position.y = baseY + Math.sin(t * 0.8) * 0.06
    }
  })

  return null
}

function IslandMesh({ onComingSoon, navigate, onHoverChange, allMeshesRef }: {
  onComingSoon: (label: string) => void
  navigate: (path: string) => void
  onHoverChange: (marker: ZoneMarker, hovered: boolean) => void
  allMeshesRef: React.RefObject<Map<string, THREE.Mesh[]>>
}) {
  const { scene } = useOptimizedGLTF('/island.glb')

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
      <ToyAnimator scene={scene} />
      {markers.map((marker) => (
        <ZoneHitbox key={marker.name} marker={marker} onComingSoon={onComingSoon} navigate={navigate} onHoverChange={onHoverChange} />
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

const BLOOM_COLOR_ACTIVE = new THREE.Color(0.9, 0.35, 0.2)
const BLOOM_COLOR_COMING_SOON = new THREE.Color(0.55, 0.35, 0.85)

interface Props {
  style?: React.CSSProperties
  onComingSoon: (label: string) => void
}

export default function IslandScene({ style, onComingSoon }: Props) {
  const navigate = useNavigate()
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map())
  const [hoveredZone, setHoveredZone] = useState<ZoneMarker | null>(null)

  const onHoverChange = useCallback((marker: ZoneMarker, hovered: boolean) => {
    setHoveredZone(hovered ? marker : null)
  }, [])

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
      <Suspense fallback={<LoadingFallback />}>
        <IslandMesh onComingSoon={onComingSoon} navigate={navigate} onHoverChange={onHoverChange} allMeshesRef={allMeshesRef} />
        <BloomDriver
          allMeshes={allMeshesRef}
          hoveredMeshes={hoveredZone?.meshes ?? []}
          color={bloomColor}
        />
      </Suspense>
      <OrbitControls
        enablePan={true}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
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
  )
}

useOptimizedGLTF.preload('/island.glb')
