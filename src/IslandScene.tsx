import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, Html } from '@react-three/drei'
import * as THREE from 'three'

interface ZoneConfig {
  label: string
  url: string | null
  type: 'active' | 'coming-soon'
}

function toTitleCase(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Blender naming: "zone_display_name" — e.g. zone_bird_sanctuary, zone_reading_room
// URL mapping lives here. Unlisted zones show as coming-soon.
const ZONE_URLS: Record<string, string> = {
  bird_sanctuary: '/bird-bingo/',
  reading_room: '/japanese-articles/',
  // boombox: '/nikbeat/',           // uncomment when ready
  // crystals: '/crystals/',         // uncomment when ready
  // family_mart: '/family-mart/',   // uncomment when ready
  // pokemon_center: '/pokemon/',    // uncomment when ready
  // nessie: '/nessie/',             // uncomment when ready
  // underground: '/underground/',   // uncomment when ready
}

function getZoneConfig(meshName: string): ZoneConfig | null {
  const key = meshName.replace(/^zone_/i, '').toLowerCase()
  const url = ZONE_URLS[key] ?? null
  const label = toTitleCase(key)
  return { label, url, type: url ? 'active' : 'coming-soon' }
}

interface ZoneMarker {
  name: string
  box: THREE.Box3
  center: THREE.Vector3
  label: string
  url: string | null
  type: 'active' | 'coming-soon'
}

function IslandMesh({ onComingSoon }: { onComingSoon: (label: string) => void }) {
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
      result.push({ name: obj.name, box, center, ...config })
    })
    return result
  }, [scene])

  return (
    <>
      <primitive object={scene} />
      {markers.map((marker) => {
        const size = new THREE.Vector3()
        marker.box.getSize(size)
        return (
          <group key={marker.name} position={marker.center}>
            {/* Invisible hitbox matching the mesh bounding box */}
            <mesh
              onClick={(e) => {
                e.stopPropagation()
                if (marker.url) {
                  window.location.href = marker.url
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
                background: 'rgba(0,0,0,0.75)',
                color: marker.type === 'active' ? '#e05a3a' : '#9ca3af',
                padding: '2px 8px',
                borderRadius: '99px',
                fontSize: '10px',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                border: `1px solid ${marker.type === 'active' ? 'rgba(224,90,58,0.4)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                {marker.label}
              </div>
            </Html>
          </group>
        )
      })}
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
        <IslandMesh onComingSoon={onComingSoon} />
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
