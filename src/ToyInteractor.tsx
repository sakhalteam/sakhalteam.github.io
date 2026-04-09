import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { getToyConfig } from './sceneMap'
import * as THREE from 'three'

/** Screen-space radius (px) within which the cursor reveals a toy label */
const REVEAL_RADIUS = 120
/** How long (seconds) a label lingers after cursor leaves proximity */
const LINGER_TIME = 1.5
/** Fade in/out speed (opacity units per second) */
const FADE_SPEED = 3

interface ToyData {
  obj: THREE.Object3D
  baseY: number
  label: string
  soundUrl: string | null
  meshes: THREE.Mesh[]
}

interface ToyState {
  opacity: number
  lastNear: number // timestamp when cursor was last within radius
  hovered: boolean // direct mesh hover
  labelDiv: HTMLDivElement | null
}

/** Audio cache so we only create one Audio element per sound */
const audioCache = new Map<string, HTMLAudioElement>()
function playSound(url: string) {
  let audio = audioCache.get(url)
  if (!audio) {
    audio = new Audio(url)
    audio.volume = 0.4
    audioCache.set(url, audio)
  }
  audio.currentTime = 0
  audio.play().catch(() => {})
}

function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
  })
  return meshes
}

/**
 * ToyInteractor — gentle bob + click-to-spin + sound + proximity labels.
 *
 * Labels are hidden by default. When the cursor moves near a toy (within
 * REVEAL_RADIUS px in screen space), its label fades in. Labels linger for
 * LINGER_TIME seconds after the cursor moves away, then fade out.
 *
 * Direct mesh hover shows a brighter highlight. Click triggers a Z-axis
 * spin + Pokemon cry.
 */
export default function ToyInteractor({ scene }: { scene: THREE.Object3D }) {
  const spinState = useRef<Map<string, { startTime: number; startRotZ: number }>>(new Map())
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const mouseScreen = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 })
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const tmpVec3 = useMemo(() => new THREE.Vector3(), [])

  const toys = useMemo(() => {
    const result: ToyData[] = []
    for (const child of scene.children) {
      const lower = child.name.toLowerCase()
      if (!lower.startsWith('toy_')) continue
      const config = getToyConfig(lower)
      const meshes = collectMeshes(child)
      result.push({
        obj: child,
        baseY: child.position.y,
        label: config?.label ?? child.name,
        soundUrl: config?.sound ?? null,
        meshes,
      })
    }
    return result
  }, [scene])

  // Per-toy mutable state (not React state — updated in useFrame for performance)
  const toyStates = useRef<Map<string, ToyState>>(new Map())
  // Initialize states
  useMemo(() => {
    for (const toy of toys) {
      if (!toyStates.current.has(toy.obj.name)) {
        toyStates.current.set(toy.obj.name, { opacity: 0, lastNear: 0, hovered: false, labelDiv: null })
      }
    }
  }, [toys])

  // All toy meshes for raycasting
  const allMeshes = useMemo(() => toys.flatMap(t => t.meshes), [toys])
  const meshToToy = useMemo(() => {
    const map = new Map<THREE.Mesh, ToyData>()
    for (const toy of toys) {
      for (const mesh of toy.meshes) map.set(mesh, toy)
    }
    return map
  }, [toys])

  const hitTest = useCallback((e: PointerEvent | MouseEvent): ToyData | null => {
    const rect = gl.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(allMeshes, false)
    if (hits.length > 0) {
      return meshToToy.get(hits[0].object as THREE.Mesh) ?? null
    }
    return null
  }, [gl, camera, raycaster, pointer, allMeshes, meshToToy])

  const triggerSpin = useCallback((toy: ToyData) => {
    if (spinState.current.has(toy.obj.name)) return
    spinState.current.set(toy.obj.name, {
      startTime: -1,
      startRotZ: toy.obj.rotation.z,
    })
    if (toy.soundUrl) playSound(toy.soundUrl)
  }, [])

  // Canvas event listeners for hover + click + mouse tracking
  useEffect(() => {
    const canvas = gl.domElement

    const onPointerMove = (e: PointerEvent) => {
      // Track screen position for proximity check in useFrame
      mouseScreen.current = { x: e.clientX, y: e.clientY }

      // Direct mesh hover for cursor + highlight
      const toy = hitTest(e)
      // Update hovered state for all toys
      for (const [name, state] of toyStates.current) {
        state.hovered = toy?.obj.name === name
      }
      if (toy) {
        canvas.style.cursor = 'pointer'
      } else if (canvas.style.cursor === 'pointer') {
        canvas.style.cursor = ''
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      pointerDown.current = { x: e.clientX, y: e.clientY }
    }

    const onClick = (e: MouseEvent) => {
      if (pointerDown.current) {
        const dx = e.clientX - pointerDown.current.x
        const dy = e.clientY - pointerDown.current.y
        if (dx * dx + dy * dy > 25) return
      }
      const toy = hitTest(e)
      if (toy) triggerSpin(toy)
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('click', onClick)
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('click', onClick)
      if (canvas.style.cursor === 'pointer') canvas.style.cursor = ''
    }
  }, [gl, hitTest, triggerSpin])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const now = performance.now()
    const rect = gl.domElement.getBoundingClientRect()
    const delta = clock.getDelta() || 1 / 60

    for (const toy of toys) {
      // Gentle bob
      toy.obj.position.y = toy.baseY + Math.sin(t * 0.8) * 0.06

      // Spin animation
      const spin = spinState.current.get(toy.obj.name)
      if (spin) {
        if (spin.startTime < 0) spin.startTime = t
        const elapsed = t - spin.startTime
        const duration = 0.6
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        toy.obj.rotation.z = spin.startRotZ + eased * Math.PI * 2
        if (progress >= 1) {
          spinState.current.delete(toy.obj.name)
        }
      }

      // Proximity label reveal — project toy center to screen space
      const state = toyStates.current.get(toy.obj.name)
      if (!state) continue

      // Get world-space center of the toy
      const box = new THREE.Box3().setFromObject(toy.obj)
      box.getCenter(tmpVec3)
      tmpVec3.project(camera)

      // Convert NDC to screen px
      const sx = (tmpVec3.x * 0.5 + 0.5) * rect.width + rect.left
      const sy = (-tmpVec3.y * 0.5 + 0.5) * rect.height + rect.top

      const dx = mouseScreen.current.x - sx
      const dy = mouseScreen.current.y - sy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const isNear = dist < REVEAL_RADIUS

      if (isNear || state.hovered) {
        state.lastNear = now
      }

      // Target opacity: 1 if near/hovered or within linger window, else 0
      const lingering = (now - state.lastNear) < LINGER_TIME * 1000
      const targetOpacity = (isNear || state.hovered || lingering) ? 1 : 0

      // Smooth fade
      if (state.opacity < targetOpacity) {
        state.opacity = Math.min(state.opacity + FADE_SPEED * delta, 1)
      } else if (state.opacity > targetOpacity) {
        state.opacity = Math.max(state.opacity - FADE_SPEED * delta, 0)
      }

      // Update DOM directly for performance (no React re-renders per frame)
      if (state.labelDiv) {
        state.labelDiv.style.opacity = String(state.opacity)
        // Highlight on direct hover
        if (state.hovered) {
          state.labelDiv.style.color = '#7dd3fc'
          state.labelDiv.style.borderColor = 'rgba(125,211,252,0.5)'
          state.labelDiv.style.boxShadow = '0 0 8px rgba(125,211,252,0.3)'
          state.labelDiv.style.background = 'rgba(0,0,0,0.9)'
        } else {
          state.labelDiv.style.color = '#9ca3af'
          state.labelDiv.style.borderColor = 'rgba(255,255,255,0.08)'
          state.labelDiv.style.boxShadow = 'none'
          state.labelDiv.style.background = 'rgba(0,0,0,0.7)'
        }
      }
    }
  })

  // Ref callback to capture label DOM elements
  const labelRef = useCallback((name: string) => (el: HTMLDivElement | null) => {
    const state = toyStates.current.get(name)
    if (state) state.labelDiv = el
  }, [])

  return (
    <>
      {toys.map((toy) => {
        const box = new THREE.Box3().setFromObject(toy.obj)
        const labelPos = new THREE.Vector3()
        box.getCenter(labelPos)
        labelPos.y = box.max.y + 0.15

        return (
          <Html
            key={toy.obj.name}
            position={labelPos}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div
              ref={labelRef(toy.obj.name)}
              style={{
                opacity: 0,
                background: 'rgba(0,0,0,0.7)',
                color: '#9ca3af',
                padding: '2px 7px',
                borderRadius: '99px',
                fontSize: '9px',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'none',
                transition: 'color 0.15s, background 0.15s, border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {toy.label}
            </div>
          </Html>
        )
      })}
    </>
  )
}
