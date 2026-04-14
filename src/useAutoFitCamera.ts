import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Automatically positions the camera to frame the entire scene nicely.
 *
 * Computes the bounding box of the loaded scene, then intelligently picks
 * an elevation angle based on the model's shape:
 *   - Tall objects (towers): lower elevation so you see the front face
 *   - Flat/wide objects (islands, rooms): higher elevation for an isometric feel
 *   - Roughly cubic: a nice 3/4 view
 *
 * Also adds a slight azimuth offset so you never get a dead-on frontal view —
 * the camera is always slightly rotated for that 3/4 perspective feel.
 */
export function useAutoFitCamera(
  scene: THREE.Object3D | null,
  orbitRef: React.RefObject<any>,
  {
    /** Extra breathing room around the model (1.0 = tight fit, 1.4 = comfortable) */
    padding = 1.3,
    /** Override elevation angle in radians. If null, auto-detect from shape. */
    elevation: elevationOverride = null as number | null,
    /** Azimuth offset in radians (rotates camera around Y axis). Default: slight 3/4 angle */
    azimuth = 0.4,
  } = {}
) {
  const { camera } = useThree()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!scene) return

    const box = new THREE.Box3().setFromObject(scene)
    if (box.isEmpty()) return

    const center = new THREE.Vector3()
    box.getCenter(center)

    const size = new THREE.Vector3()
    box.getSize(size)

    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    const radius = sphere.radius

    // Auto-detect elevation from bounding box aspect ratio
    let elevation: number
    if (elevationOverride !== null) {
      elevation = elevationOverride
    } else {
      const horizontalExtent = Math.max(size.x, size.z)
      const heightRatio = size.y / horizontalExtent

      if (heightRatio > 2.0) {
        // Very tall (e.g. tower): look mostly straight at it
        elevation = 0.3
      } else if (heightRatio > 1.0) {
        // Tallish: moderate angle
        elevation = 0.45
      } else if (heightRatio < 0.15) {
        // Extremely flat (e.g. a floor plane): slightly higher isometric
        elevation = 0.65
      } else {
        // Everything else (cubic, wide, moderately flat): nice 3/4 view
        elevation = 0.55
      }
    }

    // Calculate distance needed to fit the sphere in view
    const fov = (camera as THREE.PerspectiveCamera).fov
    const fovRad = THREE.MathUtils.degToRad(fov)
    const distance = (radius * padding) / Math.sin(fovRad / 2)

    // Position camera with elevation + azimuth for a 3/4 perspective
    const cameraOffset = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance,
      Math.cos(azimuth) * Math.cos(elevation) * distance,
    )
    camera.position.copy(center).add(cameraOffset)
    camera.lookAt(center)

    // Update orbit controls
    const controls = orbitRef.current
    if (controls) {
      controls.target.copy(center)
      controls.minDistance = radius * 0.3
      controls.maxDistance = radius * 5
      controls.update()
    }

    setReady(true)
  }, [scene, camera, orbitRef, padding, elevationOverride, azimuth])

  return ready
}
