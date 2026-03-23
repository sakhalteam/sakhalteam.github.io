import { Suspense, useRef, useMemo, useState, useEffect, memo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, OrbitControls, Environment, Html } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import './App.css'

// Hotspot config: objects in the GLB that are clickable
// name = node name prefix in the GLB, label = display name
interface HotspotConfig {
  label: string
  url: string | null      // null = just show a tooltip / coming-soon
  internal: boolean       // true = react-router, false = full page nav
}

const HOTSPOTS: Record<string, HotspotConfig> = {
  baby_deku:        { label: 'Deku Sprout',     url: null,            internal: false },
  bird_penguin:     { label: 'Penguin',         url: null,            internal: false },
  bird_ostrich:     { label: 'Ostrich',         url: null,            internal: false },
  bird_chocobo:     { label: 'Chocobo',         url: null,            internal: false },
  bird_kiwi2:       { label: 'Kiwi',            url: null,            internal: false },
  bird_flamingo:    { label: 'Flamingo',        url: null,            internal: false },
  tree_stump:       { label: 'Tree Stump',      url: null,            internal: false },
}

interface Hotspot {
  name: string
  box: THREE.Box3
  center: THREE.Vector3
  label: string
  url: string | null
  internal: boolean
  sceneObj: THREE.Object3D
}

/* ---- Fresnel aura shaders (same as island) ---- */

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

function HotspotAura({ hotspot, hovered }: { hotspot: Hotspot, hovered: boolean }) {
  const currentOpacity = useRef(0)

  const geometry = useMemo(() => {
    const obj = hotspot.sceneObj
    const geometries: THREE.BufferGeometry[] = []
    const centerOffset = new THREE.Matrix4().makeTranslation(
      -hotspot.center.x, -hotspot.center.y, -hotspot.center.z
    )

    obj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const mesh = child as THREE.Mesh
      if (!mesh.geometry) return
      const cloned = mesh.geometry.clone()
      mesh.updateWorldMatrix(true, false)
      const mat = new THREE.Matrix4().copy(mesh.matrixWorld).premultiply(centerOffset)
      cloned.applyMatrix4(mat)
      geometries.push(cloned)
    })

    if (geometries.length === 0) {
      const size = new THREE.Vector3()
      hotspot.box.getSize(size)
      return new THREE.BoxGeometry(size.x, size.y, size.z)
    }
    if (geometries.length === 1) return geometries[0]

    for (const geo of geometries) {
      const keep = new Set(['position', 'normal'])
      for (const attr of Object.keys(geo.attributes)) {
        if (!keep.has(attr)) geo.deleteAttribute(attr)
      }
    }
    return mergeGeometries(geometries, false)
  }, [hotspot.sceneObj, hotspot.center])

  const material = useMemo(() => {
    const hasUrl = hotspot.url != null
    return new THREE.ShaderMaterial({
      vertexShader: auraVertexShader,
      fragmentShader: auraFragmentShader,
      uniforms: {
        glowColor: { value: hasUrl ? new THREE.Color(0.9, 0.35, 0.2) : new THREE.Color(0.3, 0.7, 0.9) },
        intensity: { value: 2.0 },
        power: { value: 2.0 },
        opacity: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
  }, [hotspot.url])

  useFrame((_, delta) => {
    const target = hovered ? 1.0 : 0.0
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
      scale={[1.04, 1.04, 1.04]}
      raycast={() => {}}
    />
  )
}

const HotspotHitbox = memo(function HotspotHitbox({ hotspot, navigate }: { hotspot: Hotspot, navigate: (path: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const [tooltip, setTooltip] = useState(false)
  const pointerDown = useRef<{ x: number, y: number } | null>(null)
  const size = useMemo(() => {
    const s = new THREE.Vector3()
    hotspot.box.getSize(s)
    return s
  }, [hotspot.box])

  return (
    <group position={hotspot.center}>
      <HotspotAura hotspot={hotspot} hovered={hovered} />
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); setTooltip(false); document.body.style.cursor = 'auto' }}
        onPointerDown={(e) => { pointerDown.current = { x: e.clientX, y: e.clientY } }}
        onClick={(e) => {
          e.stopPropagation()
          if (pointerDown.current) {
            const dx = e.clientX - pointerDown.current.x
            const dy = e.clientY - pointerDown.current.y
            if (dx * dx + dy * dy > 25) return
          }
          if (hotspot.url) {
            if (hotspot.internal) {
              navigate(hotspot.url)
            } else {
              window.location.href = hotspot.url
            }
          } else {
            setTooltip(true)
          }
        }}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial visible={false} />
      </mesh>
      <Html center distanceFactor={18} position={[0, size.y / 2 + 0.2, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          background: hovered ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.75)',
          color: hovered
            ? (hotspot.url ? '#ff8a6a' : '#7dd3fc')
            : (hotspot.url ? '#e05a3a' : '#9ca3af'),
          padding: hovered ? '4px 14px' : '3px 10px',
          borderRadius: '99px',
          fontSize: hovered ? '14px' : '12px',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
          border: `1px solid ${hovered
            ? (hotspot.url ? 'rgba(224,90,58,0.8)' : 'rgba(125,211,252,0.5)')
            : 'rgba(255,255,255,0.1)'}`,
          boxShadow: hovered
            ? `0 0 12px ${hotspot.url ? 'rgba(224,90,58,0.5)' : 'rgba(125,211,252,0.3)'}`
            : 'none',
          transition: 'all 0.15s ease',
        }}>
          {hotspot.label}
        </div>
        {tooltip && !hotspot.url && (
          <div style={{
            marginTop: 6,
            background: 'rgba(0,0,0,0.85)',
            color: '#9ca3af',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '9px',
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
          }}>
            * chirp *
          </div>
        )}
      </Html>
    </group>
  )
})

function SanctuaryMesh({ navigate }: { navigate: (path: string) => void }) {
  const { scene, animations } = useGLTF('/zones/zone_bird_sanctuary.glb', true)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    console.log(`[BirdSanctuary] ${animations.length} animation(s) found:`, animations.map(a => a.name))
    Object.values(actions).forEach(action => action?.play())
  }, [actions, animations])

  const hotspots = useMemo(() => {
    const result: Hotspot[] = []
    scene.traverse((obj) => {
      // Match node names against hotspot keys (case-insensitive prefix match)
      const key = Object.keys(HOTSPOTS).find(k =>
        obj.name.toLowerCase().startsWith(k.toLowerCase())
      )
      if (!key) return
      const config = HOTSPOTS[key]
      const box = new THREE.Box3().setFromObject(obj)
      const center = new THREE.Vector3()
      box.getCenter(center)
      result.push({ name: obj.name, box, center, sceneObj: obj, ...config })
    })
    // Deduplicate: keep only the first match per hotspot key
    const seen = new Set<string>()
    return result.filter(h => {
      const key = Object.keys(HOTSPOTS).find(k =>
        h.name.toLowerCase().startsWith(k.toLowerCase())
      )!
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [scene])

  return (
    <>
      <primitive object={scene} />
      {hotspots.map((hotspot) => (
        <HotspotHitbox key={hotspot.name} hotspot={hotspot} navigate={navigate} />
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

export default function BirdSanctuaryScene() {
  const navigate = useNavigate()

  return (
    <div className="ocean">
      <header className="site-header">
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              color: 'var(--muted)',
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              padding: '0.35rem 1rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = '#3a5070' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--card-border)' }}
          >
            &larr; Back to Island
          </button>
          <button
            onClick={() => { window.location.href = '/bird-bingo/' }}
            style={{
              background: 'none',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              padding: '0.35rem 1rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff8a6a'; e.currentTarget.style.borderColor = '#ff8a6a' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
          >
            Play Bird Bingo &rarr;
          </button>
        </div>
        <h1 className="site-title">BIRD SANCTUARY</h1>
        <p className="site-subtitle">click on things to explore</p>
      </header>

      <div className="map-wrap">
        <Canvas
          camera={{ position: [0, 5, 16], fov: 50 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 3]} intensity={1.0} castShadow />
          <directionalLight position={[-3, 2, -4]} intensity={0.2} color="#88aaff" />
          <Environment preset="forest" />
          <Suspense fallback={<LoadingFallback />}>
            <SanctuaryMesh navigate={navigate} />
          </Suspense>
          <OrbitControls
            enablePan={true}
            mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
            minDistance={3}
            maxDistance={35}
            maxPolarAngle={Math.PI / 2.1}
          />
        </Canvas>
      </div>

      <footer className="site-footer">
        <span className="footer-hint">
          click objects to interact · drag to rotate · scroll to zoom
        </span>
      </footer>
    </div>
  )
}

useGLTF.preload('/zones/zone_bird_sanctuary.glb', true)
