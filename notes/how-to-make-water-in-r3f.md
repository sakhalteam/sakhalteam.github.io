# How to Make Stylized Water in React Three Fiber

This file is a concise implementation guide for creating the stylized water effect described in the Codrops article about stylized water in React Three Fiber.

## What stack this uses

The setup is:

- **React Three Fiber** on top of **Three.js**
- **Custom Shader Material** to extend `MeshStandardMaterial`
- **Zustand** for shared water settings
- **Leva** optionally, for live tweaking

The water itself is mostly:

- a **large horizontal plane**
- a **vertex shader** that displaces the surface over time
- a **fragment shader** that uses procedural noise and thresholding to create stylized foam/wave bands

For shoreline foam, the article's approach is to **fake the water contact on the terrain/rocks**, rather than doing a heavier depth-based intersection effect.

---

## Do you need Blender or `.glb` files?

**No**, not for the water itself.

You can make the water entirely in R3F with procedural geometry and shaders.

You only need `.glb` or Blender if you want custom environment assets like:

- rocks
- docks
- islands
- boats
- terrain
- buildings
- characters

So the practical answer is:

- **Water only:** no 3D software needed
- **Water + simple scene:** still no 3D software needed
- **Water + custom art assets:** Blender or downloaded `.glb` files become useful

---

## Install

```bash
npm i three @react-three/fiber three-custom-shader-material zustand
```

Optional:
```bash
npm i leva
```

---

## Core idea

1. Create a large horizontal plane
2. Put water settings in shared state
3. Use a custom shader material on the plane
4. Animate the surface in the vertex shader
5. Build stylized foam and wave lines in the fragment shader
6. Fake shoreline foam by adding a white stripe to terrain/rock shaders at the water height

---

## Folder suggestion

```text
src/
  components/
    Water.tsx
  shaders/
    waterVertex.glsl
    waterFragment.glsl
  store/
    waterStore.ts
```

You can also keep everything inline in one file if Claude wants to move fast.

---

## 1) Shared water store

```ts
// src/store/waterStore.ts
import { create } from 'zustand'

type WaterState = {
  waterLevel: number
  waveSpeed: number
  waveAmplitude: number
  foamDepth: number
  setWater: (partial: Partial<Omit<WaterState, 'setWater'>>) => void
}

export const useWaterStore = create<WaterState>((set) => ({
  waterLevel: 0.9,
  waveSpeed: 1.2,
  waveAmplitude: 0.1,
  foamDepth: 0.05,
  setWater: (partial) => set(partial),
}))
```

Use this so the water shader and any shoreline-intersection shaders share the same values.

---

## 2) Minimal working water component

```tsx
// src/components/Water.tsx
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import CustomShaderMaterial from 'three-custom-shader-material/vanilla'
import { useWaterStore } from '../store/waterStore'

const vertexShader = /* glsl */ `
  varying vec2 csm_vUv;

  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveAmplitude;

  void main() {
    csm_vUv = uv;

    float sineOffset = sin(uTime * uWaveSpeed) * uWaveAmplitude;

    vec3 modifiedPosition = position;

    // Because the plane is rotated flat, offset z instead of y
    modifiedPosition.z += sineOffset;

    csm_Position = modifiedPosition;
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 csm_vUv;

  uniform float uTime;
  uniform vec3 uColorFar;
  uniform float uTextureSize;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
  }

  void main() {
    vec3 finalColor = csm_FragColor.rgb;
    float alpha = 1.0;

    float textureSize = 100.0 - uTextureSize;

    // foam islands
    float noiseBase = noise(csm_vUv * (textureSize * 2.8) + sin(uTime * 0.3));
    vec3 colorBase = vec3(noiseBase);
    vec3 foam = smoothstep(0.08, 0.001, colorBase);
    foam = step(0.5, foam);

    // wave lines
    float noiseWaves = noise(csm_vUv * textureSize + sin(uTime * -0.1));
    vec3 colorWaves = vec3(noiseWaves);

    float threshold = 0.6 + 0.01 * sin(uTime * 2.0);
    vec3 waveEffect = 1.0 - (
      smoothstep(threshold + 0.03, threshold + 0.032, colorWaves) +
      smoothstep(threshold, threshold - 0.01, colorWaves)
    );
    waveEffect = step(0.5, waveEffect);

    vec3 combinedEffect = min(waveEffect + foam, 1.0);

    // far/edge color blending
    float vignette = length(csm_vUv - 0.5) * 1.5;
    vec3 baseEffect = smoothstep(0.1, 0.3, vec3(vignette));
    vec3 baseColor = mix(finalColor, uColorFar, baseEffect);

    combinedEffect = mix(combinedEffect, vec3(0.0), baseEffect);
    vec3 foamEffect = mix(foam, vec3(0.0), baseEffect);

    finalColor = (1.0 - combinedEffect) * baseColor + combinedEffect;

    alpha = mix(0.2, 1.0, foamEffect.r);
    alpha = mix(alpha, 1.0, vignette + 0.5);

    csm_FragColor = vec4(finalColor, alpha);
  }
`

export function Water() {
  const materialRef = useRef<any>(null)

  const waterLevel = useWaterStore((s) => s.waterLevel)
  const waveSpeed = useWaterStore((s) => s.waveSpeed)
  const waveAmplitude = useWaterStore((s) => s.waveAmplitude)

  const colorFar = useMemo(() => new THREE.Color('#0b6fb8'), [])

  useEffect(() => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uWaveSpeed.value = waveSpeed
    materialRef.current.uniforms.uWaveAmplitude.value = waveAmplitude
  }, [waveSpeed, waveAmplitude])

  useFrame(({ clock }) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime()
  })

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={waterLevel}>
      <planeGeometry args={[256, 256, 256, 256]} />
      <primitive
        object={
          new CustomShaderMaterial({
            baseMaterial: THREE.MeshStandardMaterial,
            vertexShader,
            fragmentShader,
            color: '#00fccd',
            transparent: true,
            opacity: 0.4,
            uniforms: {
              uTime: { value: 0 },
              uWaveSpeed: { value: waveSpeed },
              uWaveAmplitude: { value: waveAmplitude },
              uColorFar: { value: colorFar },
              uTextureSize: { value: 92.0 },
            },
          })
        }
        ref={materialRef}
        attach="material"
      />
    </mesh>
  )
}
```

---

## 3) Example scene with no Blender and no `.glb`

This proves you can do everything in code.

```tsx
import { Canvas } from '@react-three/fiber'
import { Water } from './components/Water'

function Island() {
  return (
    <mesh position={[0, 0.4, 0]}>
      <cylinderGeometry args={[3, 5, 1, 32]} />
      <meshStandardMaterial color="#7c5a3a" />
    </mesh>
  )
}

export default function App() {
  return (
    <Canvas camera={{ position: [6, 5, 8], fov: 45 }}>
      <color attach="background" args={['#d7f0ff']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={2} />

      <Island />
      <Water />
    </Canvas>
  )
}
```

---

## 4) Shoreline foam trick

Instead of doing an expensive depth-based water intersection pass, fake the shoreline by drawing a thin white stripe on terrain/rock meshes where they meet the animated water height.

### Minimal shader logic for terrain or rocks

```glsl
varying vec3 csm_vPositionW;

uniform float uTime;
uniform float uWaterLevel;
uniform float uWaveSpeed;
uniform float uWaveAmplitude;
uniform float uFoamDepth;

void main() {
  vec3 baseColor = csm_DiffuseColor.rgb;

  float sineOffset = sin(uTime * uWaveSpeed) * uWaveAmplitude;
  float currentWaterHeight = uWaterLevel + sineOffset;

  float stripe =
    smoothstep(currentWaterHeight + 0.01, currentWaterHeight - 0.01, csm_vPositionW.y)
    - smoothstep(
        currentWaterHeight + uFoamDepth + 0.01,
        currentWaterHeight + uFoamDepth - 0.01,
        csm_vPositionW.y
      );

  vec3 stripeColor = vec3(1.0);
  vec3 finalColor = mix(baseColor - stripe, stripeColor, stripe);

  csm_DiffuseColor = vec4(finalColor, 1.0);
}
```

### Why this matters

This gives the illusion that the water is interacting with objects without needing a more complex render target or depth solution.

---

## 5) If Claude wants plain Three.js instead of R3F

Same idea, just update shader uniforms manually in the animation loop.

```js
import * as THREE from 'three'

const material = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uTime: { value: 0 },
    uWaveSpeed: { value: 1.2 },
    uWaveAmplitude: { value: 0.1 },
    uTextureSize: { value: 92.0 },
    uColorFar: { value: new THREE.Color('#0b6fb8') },
    uColorNear: { value: new THREE.Color('#00fccd') },
  },
  vertexShader,
  fragmentShader,
})

const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(256, 256, 256, 256),
  material
)

mesh.rotation.x = -Math.PI / 2
mesh.position.y = 0.9
scene.add(mesh)

function animate(time) {
  material.uniforms.uTime.value = time * 0.001
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

requestAnimationFrame(animate)
```

---

## 6) What Claude should implement first

Ask Claude to do this in order:

1. Create a `Water.tsx` component with a large plane
2. Add `three-custom-shader-material`
3. Add uniforms for:
   - `uTime`
   - `uWaveSpeed`
   - `uWaveAmplitude`
   - `uTextureSize`
   - `uColorFar`
4. Animate the vertices with a sine wave
5. Add procedural noise in the fragment shader
6. Turn the noise into stylized foam/wave bands with `smoothstep` and `step`
7. Add transparency
8. Add a simple test scene with one procedural island mesh
9. After that, optionally add shoreline foam stripes to terrain/rocks

---

## 7) The short conceptual summary

The effect is just:

- a plane
- a shader
- time-based vertex motion
- procedural noise
- hard/soft thresholding for graphic wave shapes
- optional fake shoreline foam on nearby meshes

That is enough to get very close to the look from the article.

---

## 8) Good prompt to hand to Claude Code

```md
Implement a stylized water effect in my React Three Fiber app.

Requirements:
- Use React Three Fiber and Three.js
- Use three-custom-shader-material if helpful
- Create a Water.tsx component
- Water should be a large horizontal plane
- Animate the surface in the vertex shader using time, waveSpeed, and waveAmplitude
- In the fragment shader, use procedural noise and thresholding to create stylized foam/wave bands
- Keep the effect semi-transparent
- Expose basic uniforms for tweaking
- Also create a minimal demo scene with a simple procedural island mesh, no Blender or .glb needed
- Keep the implementation clean and easy to iterate on
- If possible, structure code so shoreline foam can later be added to terrain/rock shaders
```

---

## 9) Extra note

If the final result looks too soft or muddy, the usual fixes are:

- increase geometry subdivisions on the plane
- sharpen the `smoothstep` ranges
- increase contrast in the noise thresholds
- reduce the number of overlapping effects
- simplify first, then stylize further

---

## 10) Practical takeaway

You can absolutely build this effect without touching Blender at all.

Start with a plane and shader in R3F.
Only bring in `.glb` assets later if you want custom scenery.
