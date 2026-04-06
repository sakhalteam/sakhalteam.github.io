import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/**
 * A label that stays readable at all zoom levels.
 *
 * Instead of scaling linearly with distance (which makes labels tiny when
 * zoomed out and huge when close), this clamps the apparent size between
 * a min and max, so labels are always legible without crowding the view.
 *
 * Uses a `scaleFactor` that smoothly interpolates between minScale and
 * maxScale based on camera distance.
 */
export function AdaptiveLabel({
  position,
  children,
  /** Distance where label is at its smallest */
  nearDistance = 5,
  /** Distance where label is at its largest */
  farDistance = 30,
  /** Minimum scale (when camera is close) */
  minScale = 0.8,
  /** Maximum scale (when camera is far) */
  maxScale = 1.6,
}: {
  position: [number, number, number] | THREE.Vector3
  children: React.ReactNode
  nearDistance?: number
  farDistance?: number
  minScale?: number
  maxScale?: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  useFrame(() => {
    if (!groupRef.current) return

    // Get world position of the label
    const worldPos = new THREE.Vector3()
    groupRef.current.getWorldPosition(worldPos)

    // Calculate distance from camera
    const dist = camera.position.distanceTo(worldPos)

    // Smoothly interpolate scale based on distance
    // When close (< nearDistance): minScale
    // When far (> farDistance): maxScale
    // In between: smooth lerp
    const t = THREE.MathUtils.clamp(
      (dist - nearDistance) / (farDistance - nearDistance),
      0, 1
    )
    const scale = THREE.MathUtils.lerp(minScale, maxScale, t)

    groupRef.current.scale.setScalar(scale)
  })

  return (
    <group ref={groupRef} position={position}>
      <Html center style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </Html>
    </group>
  )
}
