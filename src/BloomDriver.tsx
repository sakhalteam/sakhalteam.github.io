import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Drives emissive bloom on registered meshes.
 * Iterates every registered mesh each frame — boosts hovered ones, restores the rest.
 * Shared across IslandScene, ZoneScene, and BirdSanctuaryScene.
 */
export function BloomDriver({ allMeshes, hoveredMeshes, color }: {
  allMeshes: React.RefObject<Map<string, THREE.Mesh[]>>
  hoveredMeshes: THREE.Mesh[]
  color: THREE.Color
}) {
  // Track per-MESH (not per-material) to handle shared materials
  const originals = useRef<Map<THREE.Mesh, { emissive: THREE.Color, emissiveIntensity: number }>>(new Map())
  const intensities = useRef<Map<THREE.Mesh, number>>(new Map())
  const hoveredSet = useRef<Set<THREE.Mesh>>(new Set())
  const activeColor = useRef(color)

  hoveredSet.current = new Set(hoveredMeshes)
  activeColor.current = color

  useFrame((_, delta) => {
    for (const [, meshes] of allMeshes.current) {
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (!mat.emissive) continue

        // On first encounter, clone shared materials so each mesh is independent
        if (!originals.current.has(mesh)) {
          if (!mesh.userData._bloomCloned) {
            mesh.material = mat.clone()
            mesh.userData._bloomCloned = true
          }
          const cloned = mesh.material as THREE.MeshStandardMaterial
          originals.current.set(mesh, {
            emissive: cloned.emissive.clone(),
            emissiveIntensity: cloned.emissiveIntensity,
          })
          intensities.current.set(mesh, 0)
        }

        const target = hoveredSet.current.has(mesh) ? 1.0 : 0.0
        let curr = intensities.current.get(mesh)!
        const diff = Math.abs(curr - target)

        if (diff < 0.001) {
          if (curr !== target) {
            curr = target
            intensities.current.set(mesh, curr)
          }
          if (curr === 0) {
            const orig = originals.current.get(mesh)!
            const curMat = mesh.material as THREE.MeshStandardMaterial
            curMat.emissive.copy(orig.emissive)
            curMat.emissiveIntensity = orig.emissiveIntensity
          }
          continue
        }

        curr = THREE.MathUtils.lerp(curr, target, delta * 8)
        intensities.current.set(mesh, curr)

        const orig = originals.current.get(mesh)!
        const curMat = mesh.material as THREE.MeshStandardMaterial
        // Tint emissive toward glow color at 35% max — keeps texture detail visible
        // like a "Screen" blend: dark areas stay dark, bright areas warm up
        curMat.emissive.copy(orig.emissive).lerp(activeColor.current, curr * 0.35)
        curMat.emissiveIntensity = orig.emissiveIntensity + curr * 0.08
      }
    }
  })

  return null
}

/** Collect all Mesh descendants of an Object3D (including itself if it's a mesh) */
export function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
  })
  return meshes
}

export const BLOOM_COLOR_ACTIVE = new THREE.Color(0.9, 0.35, 0.2)
export const BLOOM_COLOR_COMING_SOON = new THREE.Color(0.55, 0.35, 0.85)
