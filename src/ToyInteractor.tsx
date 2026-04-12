import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { getToyConfig, type ToyAnimation } from './sceneMap'
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
  animation: ToyAnimation
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
  const hopState = useRef<Map<string, { startTime: number }>>(new Map())
  const growState = useRef<Map<string, { startTime: number; baseScale: THREE.Vector3 }>>(new Map())
  const wobbleState = useRef<Map<string, { startTime: number; startRotX: number }>>(new Map())
  const bobState = useRef<Map<string, { startTime: number }>>(new Map())
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const mouseScreen = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 })
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const tmpVec3 = useMemo(() => new THREE.Vector3(), [])

  const toys = useMemo(() => {
    // Normalize Blender's .001/.002 dot-notation duplicates to base name.
    // Only strip dot-suffixes — underscore numbers like _01/_02 are intentional names.
    const normalizeName = (lower: string) => lower.replace(/\.\d+$/, '')

    // Collect all toy_ and eligible zc_ objects, grouping numbered Blender variants
    const byBase = new Map<string, { primary: THREE.Object3D; meshes: THREE.Mesh[] }>()

    scene.traverse((child) => {
      const lower = child.name.toLowerCase()
      if (lower.startsWith('toy_')) {
        const base = normalizeName(lower)
        // Only create entries for objects with a sceneMap config.
        // Sub-parts (toy_lapras_2 etc.) have no config and get skipped —
        // their meshes are already collected by the parent's collectMeshes.
        const config = getToyConfig(base)
        if (!config) return
        const meshes = collectMeshes(child)
        if (!byBase.has(base)) {
          byBase.set(base, { primary: child, meshes })
        } else {
          // Blender .001 duplicate — add its meshes, prefer base-named object
          const entry = byBase.get(base)!
          if (lower === base) entry.primary = child
          entry.meshes.push(...meshes)
        }
      } else if (lower.startsWith('zc_') || lower.startsWith('pc_')) {
        const config = getToyConfig(lower)
        if (!config) return // not a toy — just a glow member
        const meshes = collectMeshes(child)
        byBase.set(lower, { primary: child, meshes })
      }
    })

    return Array.from(byBase.entries()).map(([base, { primary, meshes }]) => {
      const config = getToyConfig(base)
      return {
        obj: primary,
        baseY: primary.position.y,
        label: config?.label ?? primary.name,
        soundUrl: config?.sound ?? null,
        meshes,
        animation: config?.animation ?? 'spin',
      } satisfies ToyData
    })
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

  const triggerAnimation = useCallback((toy: ToyData) => {
    const name = toy.obj.name
    if (toy.animation === 'hop') {
      if (hopState.current.has(name)) return
      hopState.current.set(name, { startTime: -1 })
    } else if (toy.animation === 'grow') {
      if (growState.current.has(name)) return
      growState.current.set(name, { startTime: -1, baseScale: toy.obj.scale.clone() })
    } else if (toy.animation === 'wobble') {
      if (wobbleState.current.has(name)) return
      wobbleState.current.set(name, { startTime: -1, startRotX: toy.obj.rotation.x })
    } else if (toy.animation === 'bob') {
      if (bobState.current.has(name)) return
      bobState.current.set(name, { startTime: -1 })
    } else if (toy.animation !== 'none') {
      // 'spin' (default)
      if (spinState.current.has(name)) return
      spinState.current.set(name, { startTime: -1, startRotZ: toy.obj.rotation.y })
    }
    // Sound plays regardless of animation type (e.g. dinosaur: none + sound)
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

    // Capture phase: fires before R3F's bubble-phase zone/portal click handlers.
    // If a toy mesh is under the pointer, consume the event so zones don't navigate.
    const onClick = (e: MouseEvent) => {
      if (pointerDown.current) {
        const dx = e.clientX - pointerDown.current.x
        const dy = e.clientY - pointerDown.current.y
        if (dx * dx + dy * dy > 25) return
      }
      const toy = hitTest(e)
      if (toy) {
        e.stopPropagation() // block zone/portal click handlers
        triggerAnimation(toy)
      }
    }

    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('click', onClick, { capture: true })
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('click', onClick, { capture: true })
      if (canvas.style.cursor === 'pointer') canvas.style.cursor = ''
    }
  }, [gl, hitTest, triggerAnimation])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const now = performance.now()
    const rect = gl.domElement.getBoundingClientRect()
    const delta = clock.getDelta() || 1 / 60

    for (const toy of toys) {
      // Gentle bob (skip hop/bob/grow/wobble/none toys — they have their own motion)
      const anim = toy.animation
      if (anim !== 'hop' && anim !== 'none' && anim !== 'bob' && anim !== 'grow' && anim !== 'wobble'
          && !hopState.current.has(toy.obj.name)) {
        toy.obj.position.y = toy.baseY + Math.sin(t * 0.8) * 0.06
      }

      // Spin animation
      const spin = spinState.current.get(toy.obj.name)
      if (spin) {
        if (spin.startTime < 0) spin.startTime = t
        const elapsed = t - spin.startTime
        const duration = 0.6
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        toy.obj.rotation.y = spin.startRotZ + eased * Math.PI * 2
        if (progress >= 1) {
          spinState.current.delete(toy.obj.name)
        }
      }

      // Pigeon hop animation — quick parabolic Y bounce
      const hop = hopState.current.get(toy.obj.name)
      if (hop) {
        if (hop.startTime < 0) hop.startTime = t
        const elapsed = t - hop.startTime
        const duration = 0.35
        const progress = Math.min(elapsed / duration, 1)
        // Parabola: peaks at 0.5 progress, returns to 0 at 1.0
        const hopHeight = 0.25 * 4 * progress * (1 - progress)
        toy.obj.position.y = toy.baseY + hopHeight
        if (progress >= 1) {
          hopState.current.delete(toy.obj.name)
        }
      }

      // Grow animation — scale pulse (origin at feet, so it "grows" upward)
      const grow = growState.current.get(toy.obj.name)
      if (grow) {
        if (grow.startTime < 0) grow.startTime = t
        const elapsed = t - grow.startTime
        const duration = 0.5
        const progress = Math.min(elapsed / duration, 1)
        // Sine pulse: 0→1→0, peaks at 30% scale increase
        const scale = 1 + 0.3 * Math.sin(progress * Math.PI)
        toy.obj.scale.copy(grow.baseScale).multiplyScalar(scale)
        if (progress >= 1) {
          toy.obj.scale.copy(grow.baseScale)
          growState.current.delete(toy.obj.name)
        }
      }

      // Wobble animation — drinky-bird x-axis tip with decay
      const wobble = wobbleState.current.get(toy.obj.name)
      if (wobble) {
        if (wobble.startTime < 0) wobble.startTime = t
        const elapsed = t - wobble.startTime
        const duration = 1.5
        const progress = Math.min(elapsed / duration, 1)
        // Decaying oscillation: 3 swings, amplitude shrinks to zero
        const amplitude = 0.5 * (1 - progress) // ~30° peak, decays
        const oscillation = Math.sin(progress * Math.PI * 6) * amplitude
        toy.obj.rotation.x = wobble.startRotX + oscillation
        if (progress >= 1) {
          toy.obj.rotation.x = wobble.startRotX
          wobbleState.current.delete(toy.obj.name)
        }
      }

      // Bob animation — exaggerated y-axis undulations with decay (eagle)
      const bob = bobState.current.get(toy.obj.name)
      if (bob) {
        if (bob.startTime < 0) bob.startTime = t
        const elapsed = t - bob.startTime
        const duration = 2.0
        const progress = Math.min(elapsed / duration, 1)
        // 5-6 undulations with decaying amplitude
        const amplitude = 0.2 * (1 - progress)
        const undulation = Math.sin(progress * Math.PI * 12) * amplitude
        toy.obj.position.y = toy.baseY + undulation
        if (progress >= 1) {
          toy.obj.position.y = toy.baseY
          bobState.current.delete(toy.obj.name)
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

      // Hover glow for labelless toys (hop) — subtle emissive tint
      if (toy.animation === 'hop') {
        for (const mesh of toy.meshes) {
          const mat = mesh.material as THREE.MeshStandardMaterial
          if (mat.emissive) {
            if (state.hovered) {
              mat.emissive.setRGB(0.15, 0.15, 0.2)
              mat.emissiveIntensity = 0.5
            } else {
              mat.emissive.setRGB(0, 0, 0)
              mat.emissiveIntensity = 0
            }
          }
        }
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
      {toys.filter(t => t.animation !== 'hop').map((toy) => {
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
