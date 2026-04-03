import { useLoader } from '@react-three/fiber'
import { GLTFLoader, DRACOLoader, MeshoptDecoder } from 'three-stdlib'

let dracoLoader: DRACOLoader | null = null

/**
 * Drop-in replacement for drei's useGLTF with Draco + Meshopt support.
 * WebP textures are decoded natively by the browser — no special loader needed.
 */
export function useOptimizedGLTF(path: string) {
  return useLoader(GLTFLoader, path, (loader) => {
    if (!dracoLoader) {
      dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
    }
    loader.setDRACOLoader(dracoLoader)
    loader.setMeshoptDecoder(typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder)
  })
}

useOptimizedGLTF.preload = (path: string) => {
  useLoader.preload(GLTFLoader, path, (loader) => {
    if (!dracoLoader) {
      dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/')
    }
    loader.setDRACOLoader(dracoLoader)
    loader.setMeshoptDecoder(typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder)
  })
}
