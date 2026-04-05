import { Suspense, useRef, useMemo, useState, useEffect, memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useAnimations, OrbitControls, Environment, Html } from '@react-three/drei'
import { useNavigate } from 'react-router-dom'
import { useOptimizedGLTF } from './useOptimizedGLTF'
import * as THREE from 'three'
import './App.css'

/**
 * Portal URL mapping. Key = suffix after "portal_" in the GLB node name.
 * If a portal_ object is found but not listed here, it's shown as a label-only hotspot.
 */
const PORTAL_URLS: Record<string, { label: string, url: string }> = {
  adhdo:              { label: 'ADHDO',              url: '/adhdo/' },
  bird_bingo:         { label: 'Bird Bingo',         url: '/bird-bingo/' },
  japanese_articles:  { label: 'Japanese Articles',   url: '/japanese-articles/' },
  nikbeat:            { label: 'NikBeat',            url: '/nikbeat/' },
  pokemon_park:       { label: 'Pokemon Park',       url: '/pokemon-park/' },
  weather_report:     { label: 'Weather Report',     url: '/weather-report/' },
}

function toTitleCase(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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

const HotspotHitbox = memo(function HotspotHitbox({ hotspot, navigate }: { hotspot: Hotspot, navigate: (path: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const pointerDown = useRef<{ x: number, y: number } | null>(null)
  const size = useMemo(() => {
    const s = new THREE.Vector3()
    hotspot.box.getSize(s)
    return s
  }, [hotspot.box])

  return (
    <group position={hotspot.center}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
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
          }
        }}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial visible={false} />
      </mesh>
      <Html center distanceFactor={18} position={[0, size.y / 2 + 0.2, 0]} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          background: hovered ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.75)',
          color: hovered ? (hotspot.url ? '#ff8a6a' : '#7dd3fc') : (hotspot.url ? '#e05a3a' : '#9ca3af'),
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
      </Html>
    </group>
  )
})

function ZoneMesh({ glbPath, navigate }: { glbPath: string, navigate: (path: string) => void }) {
  const { scene, animations } = useOptimizedGLTF(glbPath)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    Object.values(actions).forEach(action => action?.play())
  }, [actions])

  const hotspots = useMemo(() => {
    const result: Hotspot[] = []
    const seen = new Set<string>()

    // Only scan top-level children — avoids picking up sub-meshes from
    // multi-primitive objects (e.g. portal_adhdo with 10 materials creates
    // child meshes named portal_adhdo_1, portal_adhdo_2, etc.)
    for (const obj of scene.children) {
      const lower = obj.name.toLowerCase()

      // portal_ → external navigation
      if (lower.startsWith('portal_')) {
        const key = lower.replace(/^portal_/, '')
        if (seen.has(key)) continue
        seen.add(key)
        const entry = PORTAL_URLS[key]
        const box = new THREE.Box3().setFromObject(obj)
        const center = new THREE.Vector3()
        box.getCenter(center)
        result.push({
          name: obj.name, box, center,
          label: entry?.label ?? toTitleCase(key),
          url: entry?.url ?? null,
          internal: false,
          sceneObj: obj,
        })
        continue
      }

      // zone_ → internal sub-zone navigation
      if (lower.startsWith('zone_')) {
        const key = lower.replace(/^zone_/, '')
        if (seen.has(key)) continue
        seen.add(key)
        const box = new THREE.Box3().setFromObject(obj)
        const center = new THREE.Vector3()
        box.getCenter(center)
        result.push({
          name: obj.name, box, center,
          label: toTitleCase(key),
          url: `/zone-${key.replace(/_/g, '-')}`,
          internal: true,
          sceneObj: obj,
        })
      }
    }
    return result
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

interface ZoneSceneProps {
  glbPath: string
  title: string
  subtitle?: string
  cameraPosition?: [number, number, number]
  environmentPreset?: 'night' | 'forest' | 'sunset' | 'dawn' | 'apartment' | 'city' | 'park' | 'lobby' | 'studio' | 'warehouse'
}

export default function ZoneScene({ glbPath, title, subtitle = 'click on things to explore', cameraPosition = [0, 5, 16], environmentPreset = 'night' }: ZoneSceneProps) {
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
        </div>
        <h1 className="site-title">{title}</h1>
        <p className="site-subtitle">{subtitle}</p>
      </header>

      <div className="map-wrap">
        <Canvas
          camera={{ position: cameraPosition, fov: 50 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 3]} intensity={1.0} castShadow />
          <directionalLight position={[-3, 2, -4]} intensity={0.2} color="#88aaff" />
          <Environment preset={environmentPreset} />
          <Suspense fallback={<LoadingFallback />}>
            <ZoneMesh glbPath={glbPath} navigate={navigate} />
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
