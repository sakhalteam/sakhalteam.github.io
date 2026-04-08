import { Suspense, useRef, useMemo, useState, useEffect, useCallback, memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAnimations, OrbitControls, Environment, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
import { useOptimizedGLTF } from './useOptimizedGLTF'
import { useKeyboardControls } from './useKeyboardControls'
import { useAutoFitCamera } from './useAutoFitCamera'
import { useTurntable } from './useTurntable'
import { AdaptiveLabel } from './AdaptiveLabel'
import { BloomDriver, collectMeshes, BLOOM_COLOR_ACTIVE } from './BloomDriver'
import { getHotspotConfig } from './sceneMap'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import './App.css'

/** Keys of objects in the GLB that are interactive hotspots */
const HOTSPOT_KEYS = [
  'portal_bird_bingo',
  'baby_deku', 'bird_penguin', 'bird_ostrich', 'bird_chocobo',
  'bird_kiwi2', 'bird_flamingo', 'tree_stump',
]

interface Hotspot {
  name: string
  box: THREE.Box3
  center: THREE.Vector3
  label: string
  url: string | null
  internal: boolean
  sceneObj: THREE.Object3D
  meshes: THREE.Mesh[]
}

const HotspotHitbox = memo(function HotspotHitbox({
  hotspot,
  navigate,
  onHoverChange,
}: {
  hotspot: Hotspot
  navigate: (path: string) => void
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void
}) {
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
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          onHoverChange(hotspot, true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          setTooltip(false)
          onHoverChange(hotspot, false)
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
      <AdaptiveLabel position={[0, size.y / 2 + 0.2, 0]} nearDistance={5} farDistance={20}>
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
      </AdaptiveLabel>
    </group>
  )
})

function SanctuaryMesh({
  navigate,
  onSceneReady,
  onHoverChange,
  allMeshesRef,
}: {
  navigate: (path: string) => void
  onSceneReady: (scene: THREE.Object3D) => void
  onHoverChange: (hotspot: Hotspot, hovered: boolean) => void
  allMeshesRef: React.RefObject<Map<string, THREE.Mesh[]>>
}) {
  const { scene, animations } = useOptimizedGLTF('/zones/zone_bird_sanctuary.glb')
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    console.log(`[BirdSanctuary] ${animations.length} animation(s) found:`, animations.map(a => a.name))
    Object.values(actions).forEach(action => action?.play())
  }, [actions, animations])

  useEffect(() => {
    onSceneReady(scene)
  }, [scene, onSceneReady])

  const hotspots = useMemo(() => {
    const result: Hotspot[] = []
    const seen = new Set<string>()

    scene.traverse((obj) => {
      const key = HOTSPOT_KEYS.find(k =>
        obj.name.toLowerCase().startsWith(k.toLowerCase())
      )
      if (!key) return
      if (seen.has(key)) return
      seen.add(key)

      const config = getHotspotConfig(key)
      const box = new THREE.Box3().setFromObject(obj)
      const center = new THREE.Vector3()
      box.getCenter(center)
      const meshes = collectMeshes(obj)

      const hotspot: Hotspot = {
        name: obj.name,
        box,
        center,
        sceneObj: obj,
        meshes,
        label: config?.label ?? key,
        url: config?.url ?? null,
        internal: config?.internal ?? false,
      }
      allMeshesRef.current.set(hotspot.name, hotspot.meshes)
      result.push(hotspot)
    })

    return result
  }, [scene, allMeshesRef])

  return (
    <>
      <primitive object={scene} />
      {hotspots.map((hotspot) => (
        <HotspotHitbox
          key={hotspot.name}
          hotspot={hotspot}
          navigate={navigate}
          onHoverChange={onHoverChange}
        />
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

/** Connects keyboard controls + auto-fit camera + turntable to OrbitControls */
function CameraRig({ orbitRef, scene, turntableToggleRef, onPlayingChange }: {
  orbitRef: React.RefObject<any>
  scene: THREE.Object3D | null
  turntableToggleRef: React.RefObject<(() => void) | null>
  onPlayingChange: (playing: boolean) => void
}) {
  const { stop, toggle, playing } = useTurntable(orbitRef)
  useKeyboardControls(orbitRef, { onInteract: stop })
  useAutoFitCamera(scene, orbitRef)

  turntableToggleRef.current = toggle

  useEffect(() => {
    onPlayingChange(playing)
  }, [playing, onPlayingChange])

  return null
}

export default function BirdSanctuaryScene() {
  const navigate = useNavigate()
  const orbitRef = useRef<any>(null)
  const turntableToggleRef = useRef<(() => void) | null>(null)
  const allMeshesRef = useRef<Map<string, THREE.Mesh[]>>(new Map())
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null)
  const [hoveredHotspot, setHoveredHotspot] = useState<Hotspot | null>(null)
  const [turntablePlaying, setTurntablePlaying] = useState(true)

  const onHoverChange = useCallback((hotspot: Hotspot, hovered: boolean) => {
    setHoveredHotspot(hovered ? hotspot : null)
  }, [])

  const onPlayingChange = useCallback((playing: boolean) => {
    setTurntablePlaying(playing)
  }, [])

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
          camera={{ fov: 50 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 3]} intensity={1.0} castShadow />
          <directionalLight position={[-3, 2, -4]} intensity={0.2} color="#88aaff" />
          <Environment preset="forest" />
          <Suspense fallback={<LoadingFallback />}>
            <SanctuaryMesh
              navigate={navigate}
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
            mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
            maxPolarAngle={Math.PI / 2.1}
          />
          <CameraRig orbitRef={orbitRef} scene={loadedScene} turntableToggleRef={turntableToggleRef} onPlayingChange={onPlayingChange} />
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
          click objects to interact · drag to rotate · scroll to zoom · WASD pan · QE orbit · RF zoom · ZX rise/lower
        </span>
        <button
          className="turntable-toggle"
          onClick={() => turntableToggleRef.current?.()}
          title={turntablePlaying ? 'Pause rotation' : 'Resume rotation'}
        >
          {turntablePlaying ? '\u23F8' : '\u23F5'}
        </button>
      </footer>
    </div>
  )
}

useOptimizedGLTF.preload('/zones/zone_bird_sanctuary.glb')
