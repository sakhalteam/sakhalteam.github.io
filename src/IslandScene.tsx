import { Suspense, useRef, useMemo, useState, memo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, Html } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

interface ZoneConfig {
  label: string
  url: string | null
  internal: boolean  // true = React Router navigate, false = full page navigation
  type: 'active' | 'coming-soon'
}

function toTitleCase(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Blender naming: "zone_display_name" — e.g. zone_bird_sanctuary, zone_reading_room
// URL mapping lives here. Unlisted zones show as coming-soon.
// internal: true = zone scene within this app, false = separate deployed site
const ZONE_URLS: Record<string, { url: string, internal: boolean }> = {
  bird_sanctuary: { url: '/bird-sanctuary', internal: true },
  reading_room: { url: '/japanese-articles/', internal: false },
  boombox: { url: '/nikbeat/', internal: false },
  pokemon_park: { url: '/pokemon-park/', internal: false },
  adhdo: { url: '/adhdo/', internal: false },
  weather_report: { url: '/weather-report/', internal: false },
  // crystals: { url: '/crystals', internal: true },
  // family_mart: { url: '/family-mart', internal: true },
  // nessie: { url: '/nessie', internal: true },
  // underground: { url: '/underground', internal: true },
}

function getZoneConfig(meshName: string): ZoneConfig | null {
  const key = meshName.replace(/^zone_/i, '').toLowerCase()
  const entry = ZONE_URLS[key]
  const label = toTitleCase(key)
  return { label, url: entry?.url ?? null, internal: entry?.internal ?? false, type: entry ? 'active' : 'coming-soon' }
}

interface ZoneMarker {
  name: string
  box: THREE.Box3
  center: THREE.Vector3
  label: string
  url: string | null
  internal: boolean
  type: 'active' | 'coming-soon'
  sceneObj: THREE.Object3D
}

/* ---- Fresnel aura shaders ---- */

const auraVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const auraFragmentShader = `
  uniform vec3 glowColor;
  uniform float intensity;
  uniform float power;
  uniform float opacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
    fresnel = pow(fresnel, power);
    gl_FragColor = vec4(glowColor * intensity, fresnel * opacity);
  }
`

function ZoneAura({ marker, hovered }: { marker: ZoneMarker, hovered: boolean }) {
  const currentOpacity = useRef(0)

  const geometry = useMemo(() => {
    const obj = marker.sceneObj
    const geometries: THREE.BufferGeometry[] = []

    // We need to transform all child meshes into a space where
    // marker.center is the origin (since the parent <group> is at marker.center)
    const centerOffset = new THREE.Matrix4().makeTranslation(
      -marker.center.x, -marker.center.y, -marker.center.z
    )

    obj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      if (!mesh.geometry) return
      const cloned = mesh.geometry.clone()
      // Apply child's world transform, then offset so marker.center = origin
      mesh.updateWorldMatrix(true, false)
      const mat = new THREE.Matrix4().copy(mesh.matrixWorld).premultiply(centerOffset)
      cloned.applyMatrix4(mat)
      geometries.push(cloned)
    })

    if (geometries.length === 0) {
      // Fallback: use bounding box as aura shape (e.g. if zone is an empty with no mesh children)
      const size = new THREE.Vector3()
      marker.box.getSize(size)
      return new THREE.BoxGeometry(size.x, size.y, size.z)
    }
    if (geometries.length === 1) return geometries[0]

    // Normalize attributes: keep only position + normal (the aura shader only needs these).
    // Strips uv1, uv2, etc. that cause mergeGeometries to fail on mixed meshes.
    for (const geo of geometries) {
      const keep = new Set(['position', 'normal'])
      for (const attr of Object.keys(geo.attributes)) {
        if (!keep.has(attr)) geo.deleteAttribute(attr)
      }
    }
    return mergeGeometries(geometries, false)
  }, [marker.sceneObj, marker.center])

  const material = useMemo(() => {
    const isActive = marker.type === 'active'
    return new THREE.ShaderMaterial({
      vertexShader: auraVertexShader,
      fragmentShader: auraFragmentShader,
      uniforms: {
        glowColor: { value: isActive ? new THREE.Color(0.9, 0.35, 0.2) : new THREE.Color(0.5, 0.5, 0.6) },
        intensity: { value: 2.0 },
        power: { value: 2.5 },
        opacity: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
  }, [marker.type])

  useFrame((_, delta) => {
    const target = hovered ? 1.0 : 0.0
    // Skip work when opacity is already at (or very near) the target
    if (Math.abs(currentOpacity.current - target) < 0.001) {
      currentOpacity.current = target
      material.uniforms.opacity.value = target
      return
    }
    currentOpacity.current = THREE.MathUtils.lerp(currentOpacity.current, target, delta * 5)
    material.uniforms.opacity.value = currentOpacity.current
  })

  if (!geometry) return null

  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={[1.12, 1.12, 1.12]}
      raycast={() => {}} // don't intercept pointer events
    />
  )
}

const ZoneHitbox = memo(function ZoneHitbox({ marker, onComingSoon, navigate }: { marker: ZoneMarker, onComingSoon: (label: string) => void, navigate: (path: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const pointerDown = useRef<{ x: number, y: number } | null>(null)
  const size = useMemo(() => {
    const s = new THREE.Vector3()
    marker.box.getSize(s)
    return s
  }, [marker.box])

  return (
    <group position={marker.center}>
      {/* Fresnel aura on the actual zone geometry */}
      <ZoneAura marker={marker} hovered={hovered} />
      {/* Invisible hitbox for hover/click detection */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
        onPointerDown={(e) => { pointerDown.current = { x: e.clientX, y: e.clientY } }}
        onClick={(e) => {
          e.stopPropagation()
          // Ignore clicks that were actually orbit drags
          if (pointerDown.current) {
            const dx = e.clientX - pointerDown.current.x
            const dy = e.clientY - pointerDown.current.y
            if (dx * dx + dy * dy > 25) return // moved more than 5px = drag
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
      {/* Label floats above the bounding box */}
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

function IslandMesh({ onComingSoon, navigate }: { onComingSoon: (label: string) => void, navigate: (path: string) => void }) {
  const { scene } = useGLTF('/island.glb', true)

  const markers = useMemo(() => {
    const result: ZoneMarker[] = []
    scene.traverse((obj) => {
      if (!obj.name.toLowerCase().startsWith('zone_')) return
      const config = getZoneConfig(obj.name)
      if (!config) return
      // Compute world-space bounding box of this mesh (and any children)
      const box = new THREE.Box3().setFromObject(obj)
      const center = new THREE.Vector3()
      box.getCenter(center)
      result.push({ name: obj.name, box, center, sceneObj: obj, ...config })
    })
    return result
  }, [scene])

  return (
    <>
      <primitive object={scene} />
      {markers.map((marker) => (
        <ZoneHitbox key={marker.name} marker={marker} onComingSoon={onComingSoon} navigate={navigate} />
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

interface Props {
  style?: React.CSSProperties
  onComingSoon: (label: string) => void
}

export default function IslandScene({ style, onComingSoon }: Props) {
  const navigate = useNavigate()
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
        <IslandMesh onComingSoon={onComingSoon} navigate={navigate} />
      </Suspense>
      <OrbitControls
        enablePan={true}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  )
}

useGLTF.preload('/island.glb', true)
