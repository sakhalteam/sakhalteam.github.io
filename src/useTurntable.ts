import { useEffect, useRef, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Slow auto-rotation turntable for 3D scenes.
 *
 * Rotates the camera around the orbit target at a gentle speed.
 * Stops permanently as soon as the user interacts (mouse or keyboard).
 *
 * Returns a `stopTurntable` callback that can be passed to other
 * interaction hooks (e.g. useKeyboardControls' onInteract).
 */
export function useTurntable(
  orbitRef: React.RefObject<any>,
  {
    /** Rotation speed in radians per second. Default: ~6° per second */
    speed = 0.1,
    /** Direction: 1 = counter-clockwise (from above), -1 = clockwise */
    direction = 1,
  } = {}
) {
  const active = useRef(true)
  const { gl } = useThree()

  const stop = useCallback(() => {
    active.current = false
  }, [])

  // Stop on any mouse/touch/scroll interaction with the canvas
  useEffect(() => {
    const canvas = gl.domElement

    const onInteract = () => { active.current = false }

    canvas.addEventListener('pointerdown', onInteract)
    canvas.addEventListener('wheel', onInteract)
    canvas.addEventListener('touchstart', onInteract)

    return () => {
      canvas.removeEventListener('pointerdown', onInteract)
      canvas.removeEventListener('wheel', onInteract)
      canvas.removeEventListener('touchstart', onInteract)
    }
  }, [gl])

  useFrame(({ camera }, delta) => {
    if (!active.current) return
    const controls = orbitRef.current
    if (!controls) return

    // Rotate camera position around the orbit target on the Y axis
    const offset = camera.position.clone().sub(controls.target)
    const angle = speed * direction * delta
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    camera.position.copy(controls.target).add(offset)

    controls.update()
  })

  return stop
}
