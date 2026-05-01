// Water.tsx
//
// Stylized water with surface foam, wave lines, and depth-based intersection
// foam (rim where water meets geometry). Adapted from the Codrops tutorial
// + the linked Three.js sandbox (notes/claude_heres_the_sandbox_js_file.js).
//
// For prop reference and tuning recipes, see notes/water_settings.md.

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 csm_vUv;

  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveAmplitude;
  uniform vec2 uFunnelCenter;
  uniform float uFunnelRadius;
  uniform float uFunnelDepth;
  uniform vec2 uBeachSafetyCenter;
  uniform vec2 uBeachSafetyRadius;
  uniform float uBeachSafetyDepth;

  void main() {
    csm_vUv = uv;

    vec3 modifiedPosition = position;

    // Distance from island center (local XY = world XZ since plane is rotated)
    float shoreDist = length(position.xy);

    // Plane is rotated -π/2 on X, so local +Y maps to world -Z.
    // Vertex world XZ = (position.x, -position.y).
    vec2 vertexWorldXZ = vec2(position.x, -position.y);
    float funnelDist = length(vertexWorldXZ - uFunnelCenter);
    float funnel = smoothstep(uFunnelRadius, 0.0, funnelDist);
    float funnelDepression = funnel * funnel * uFunnelDepth;

    vec2 beachDelta = (vertexWorldXZ - uBeachSafetyCenter) / max(uBeachSafetyRadius, vec2(0.001));
    float beachSafety = 1.0 - smoothstep(0.65, 1.0, length(beachDelta));

    // Two overlapping sine waves for organic motion
    float wave1 = sin(position.x * 0.8 + uTime * uWaveSpeed) * uWaveAmplitude;
    float wave2 = sin(position.y * 0.6 + uTime * uWaveSpeed * 0.7 + 1.5) * uWaveAmplitude * 0.6;

    // Dampen waves near shoreline, inside the funnel, and inside any hand-tuned beach-safe cove.
    float waveScale = smoothstep(4.0, 8.0, shoreDist) * (1.0 - funnel) * (1.0 - beachSafety);
    modifiedPosition.z += (wave1 + wave2) * waveScale;

    // Push water surface down near the island to prevent beach submersion
    float shoreDepression = smoothstep(7.0, 3.0, shoreDist) * 0.12;
    modifiedPosition.z -= shoreDepression;
    modifiedPosition.z -= beachSafety * uBeachSafetyDepth;

    modifiedPosition.z -= funnelDepression;

    csm_Position = modifiedPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 csm_vUv;

  uniform float uTime;
  uniform float uFoamSpeed;
  uniform float uFoamDepth;
  uniform vec3 uColorFar;
  uniform vec3 uShallowColor;
  uniform float uSurfaceBoost;
  uniform float uFoamBoost;
  uniform float uFoamScale;
  uniform float uWaveScale;
  uniform vec2 uFunnelCenter;
  uniform float uFunnelRadius;
  uniform float uHoleRadius;
  uniform float uHoleFeather;
  uniform float uPlaneSize;

  // Depth-based intersection foam
  uniform sampler2D uDepthTexture;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uRimWidth;
  uniform vec3 uRimColor;
  uniform float uRimStrength;

  // 2D simplex noise (Ashima / Ian McEwan). Returns approx [-1, 1].
  // Remap to [0, 1] at call sites with: snoise(p) * 0.5 + 0.5
  vec3 permute(vec3 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
  }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                   + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0),
                            dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Non-linear window depth [0,1] → view-space Z (negative for perspective)
  float depthToViewZ(float depth, float near, float far) {
    return (near * far) / ((far - near) * depth - far);
  }

  void main() {
    vec3 finalColor = csm_FragColor.rgb;
    float alpha = csm_FragColor.a;

    float tFoam = uTime * uFoamSpeed;

    // Foam islands (simplex noise remapped to [0, 1]).
    // uFoamScale: higher = smaller/denser foam; lower = bigger/sparser.
    // uFoamDepth: upper threshold of the foam cutoff — higher = thicker/more foam coverage.
    float noiseBase = snoise(csm_vUv * uFoamScale + sin(tFoam * 0.3)) * 0.5 + 0.5;
    vec3 colorBase = vec3(noiseBase);
    vec3 foam = smoothstep(uFoamDepth, 0.001, colorBase);
    foam = step(0.5, foam);

    // Wave lines. Same direction as uFoamScale.
    float noiseWaves = snoise(csm_vUv * uWaveScale + sin(tFoam * -0.1)) * 0.5 + 0.5;
    vec3 colorWaves = vec3(noiseWaves);
    float threshold = 0.6 + 0.01 * sin(tFoam * 2.0);
    vec3 waveEffect = 1.0 - (
      smoothstep(threshold + 0.03, threshold + 0.032, colorWaves) +
      smoothstep(threshold, threshold - 0.01, colorWaves)
    );
    waveEffect = step(0.5, waveEffect);

    vec3 combinedEffect = min(waveEffect + foam, 1.0);

    // Edge fade — distance from center, fades to transparent
    float dist = length(csm_vUv - 0.5) * 2.0;
    float edgeFade = smoothstep(0.6, 1.0, dist);

    // Far color blending (deeper = darker)
    vec3 litWater = mix(finalColor, uShallowColor, uSurfaceBoost);
    vec3 baseColor = mix(litWater, uColorFar, smoothstep(0.1, 0.4, dist));

    // Suppress foam/waves near edges
    combinedEffect = mix(combinedEffect, vec3(0.0), edgeFade);

    vec3 foamColor = vec3(1.0 + uFoamBoost);
    finalColor = (1.0 - combinedEffect) * baseColor + combinedEffect * foamColor;

    // Fade alpha at edges for soft boundary
    alpha *= (1.0 - edgeFade);

    // ---- Intersection foam (rim) ----
    // Sample scene depth at this fragment's screen position, compare with our
    // own fragment depth. Small difference = water surface is close to scene
    // geometry = rim foam.
    if (uRimWidth > 0.0001) {
      vec2 screenUV = gl_FragCoord.xy / uResolution;
      float sceneDepth = texture2D(uDepthTexture, screenUV).x;
      float sceneViewZ = depthToViewZ(sceneDepth, uCameraNear, uCameraFar);
      float fragViewZ = depthToViewZ(gl_FragCoord.z, uCameraNear, uCameraFar);
      // Both view Z are negative; fragViewZ (water) is less negative (closer to
      // camera), sceneViewZ (geometry behind water) more negative. Their
      // absolute difference = water column thickness in world units.
      float waterColumn = max(fragViewZ - sceneViewZ, 0.0);

      float rim = 1.0 - smoothstep(0.0, uRimWidth, waterColumn);
      // Animate the edge with a fast noise pattern so it looks organic
      float rimDetail = snoise(csm_vUv * 55.0 + vec2(tFoam * 0.4, tFoam * -0.3)) * 0.5 + 0.5;
      float rimMask = clamp(rim * (0.55 + 0.9 * rimDetail), 0.0, 1.0);
      rimMask = smoothstep(0.35, 0.85, rimMask) * uRimStrength;

      finalColor = mix(finalColor, uRimColor, rimMask);
      alpha = max(alpha, rimMask);
    }

    // Cut a soft hole in the water where the whirlpool mouth is
    vec2 worldXZ = vec2(
      (csm_vUv.x - 0.5) * uPlaneSize,
      -(csm_vUv.y - 0.5) * uPlaneSize
    );
    float funnelDist = length(worldXZ - uFunnelCenter);
    float holeMask = smoothstep(
      uHoleRadius - uHoleFeather,
      uHoleRadius,
      funnelDist
    );
    alpha *= holeMask;

    csm_FragColor = vec4(finalColor, alpha);
  }
`;

const DEFAULT_BEACH_SAFETY_CENTER: [number, number] = [9999, 9999];
const DEFAULT_BEACH_SAFETY_RADIUS: [number, number] = [1, 1];

interface WaterProps {
  /** Y position of the water plane */
  waterLevel?: number;
  /** Size of the plane (will be square) */
  size?: number;
  /** Ref to a world-space position whose XZ gets a funnel depression (e.g. the whirlpool) */
  funnelCenter?: React.RefObject<THREE.Vector3>;
  /** Radius of the funnel falloff in world units */
  funnelRadius?: number;
  /** Max depth of the funnel in world units */
  funnelDepth?: number;
  /** Optional world XZ center of a cove/beach area that should stay calmer and lower than the open water. */
  beachSafetyCenter?: [number, number];
  /** Ellipse radius in world XZ units for the beach-safety depression. */
  beachSafetyRadius?: [number, number];
  /** Extra water depression inside the beach-safety ellipse, in world units. */
  beachSafetyDepth?: number;
  /** Base water color */
  color?: string;
  shallowColor?: string;
  deepColor?: string;
  surfaceBoost?: number;
  foamBoost?: number;
  /** Opacity of the water surface (0–1) */
  opacity?: number;
  /** Speed of the 3D surface bobbing (vertex ripples). Low visual impact top-down. */
  waveSpeed?: number;
  /** Vertex wave height in world units. Higher = choppier surface. */
  waveAmplitude?: number;
  /** Speed of foam/wave-line drift across the surface. Set low (e.g. 0.1) for calm. */
  foamSpeed?: number;
  /** Foam island density. Lower = bigger/sparser foam blobs; higher = smaller/denser. */
  foamScale?: number;
  /** Foam threshold/coverage. Higher = thicker, more foam; lower = thinner, sparser. */
  foamDepth?: number;
  /** Wave line density. Lower = bigger/sparser squiggles; higher = smaller/denser. */
  waveScale?: number;
  /** Width of intersection-foam rim, in world units. 0 disables rim + depth pass. */
  rimWidth?: number;
  /** Color of intersection foam where water meets geometry */
  rimColor?: string;
  /** Opacity/blend strength of rim foam (0–1) */
  rimStrength?: number;
}

export default function Water({
  waterLevel = -0.03,
  size = 80,
  funnelCenter,
  funnelRadius = 3.8,
  funnelDepth = 0.85,
  beachSafetyCenter = DEFAULT_BEACH_SAFETY_CENTER,
  beachSafetyRadius = DEFAULT_BEACH_SAFETY_RADIUS,
  beachSafetyDepth = 0,
  color = "#00fccd",
  shallowColor = "#6ee7d8",
  deepColor = "#0b6fb8",
  surfaceBoost = 0.35,
  foamBoost = 0.35,
  opacity = 0.7,
  waveSpeed = 0.55,
  waveAmplitude = 0.04,
  foamSpeed = 0.25,
  foamScale = 22,
  foamDepth = 0.08,
  waveScale = 8,
  rimWidth = 0.6,
  rimColor = "#ffffff",
  rimStrength = 0.95,
}: WaterProps) {
  const materialRef = useRef<CustomShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl, scene, camera, size: viewportSize } = useThree();

  // Render target with a depth texture: we render the scene (minus water) into
  // this each frame to capture per-pixel scene depth, which the water shader
  // samples for intersection foam.
  const depthRT = useMemo(() => {
    const pr = gl.getPixelRatio();
    const w = Math.max(1, Math.floor(viewportSize.width * pr));
    const h = Math.max(1, Math.floor(viewportSize.height * pr));
    const rt = new THREE.WebGLRenderTarget(w, h);
    rt.texture.minFilter = THREE.NearestFilter;
    rt.texture.magFilter = THREE.NearestFilter;
    rt.texture.generateMipmaps = false;
    rt.stencilBuffer = false;
    rt.depthBuffer = true;
    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.type = THREE.UnsignedIntType;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;
    rt.depthTexture = depthTex;
    return rt;
    // gl is stable; depthRT is created once and resized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    const pr = gl.getPixelRatio();
    depthRT.setSize(
      Math.max(1, Math.floor(viewportSize.width * pr)),
      Math.max(1, Math.floor(viewportSize.height * pr)),
    );
  }, [viewportSize.width, viewportSize.height, gl, depthRT]);

  useEffect(() => {
    return () => depthRT.dispose();
  }, [depthRT]);

  const material = useMemo(() => {
    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader,
      fragmentShader,
      color,
      transparent: true,
      opacity,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWaveSpeed: { value: waveSpeed },
        uWaveAmplitude: { value: waveAmplitude },
        uFoamSpeed: { value: foamSpeed },
        uFoamDepth: { value: foamDepth },
        uColorFar: { value: new THREE.Color(deepColor) },
        uShallowColor: { value: new THREE.Color(shallowColor) },
        uSurfaceBoost: { value: surfaceBoost },
        uFoamBoost: { value: foamBoost },
        uFoamScale: { value: foamScale },
        uWaveScale: { value: waveScale },
        uFunnelCenter: { value: new THREE.Vector2(9999, 9999) },
        uFunnelRadius: { value: funnelRadius },
        uFunnelDepth: { value: funnelDepth },
        uBeachSafetyCenter: {
          value: new THREE.Vector2(beachSafetyCenter[0], beachSafetyCenter[1]),
        },
        uBeachSafetyRadius: {
          value: new THREE.Vector2(beachSafetyRadius[0], beachSafetyRadius[1]),
        },
        uBeachSafetyDepth: { value: beachSafetyDepth },
        uHoleRadius: { value: funnelRadius * 0.35 },
        uHoleFeather: { value: 0.9 },
        uPlaneSize: { value: size },
        uDepthTexture: { value: depthRT.depthTexture },
        uResolution: { value: new THREE.Vector2(depthRT.width, depthRT.height) },
        uCameraNear: { value: (camera as THREE.PerspectiveCamera).near ?? 0.1 },
        uCameraFar: { value: (camera as THREE.PerspectiveCamera).far ?? 1000 },
        uRimWidth: { value: rimWidth },
        uRimColor: { value: new THREE.Color(rimColor) },
        uRimStrength: { value: rimStrength },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    size,
    funnelRadius,
    funnelDepth,
    beachSafetyCenter[0],
    beachSafetyCenter[1],
    beachSafetyRadius[0],
    beachSafetyRadius[1],
    beachSafetyDepth,
    color,
    shallowColor,
    deepColor,
    surfaceBoost,
    foamBoost,
    opacity,
    waveSpeed,
    waveAmplitude,
    foamSpeed,
    foamScale,
    foamDepth,
    waveScale,
    rimWidth,
    rimColor,
    rimStrength,
    depthRT,
  ]);

  // Runs at default priority 0 — before the EffectComposer's render (priority
  // 1), so the depth texture is fresh by the time the water shader samples it.
  useFrame(({ clock }) => {
    if (!materialRef.current || !meshRef.current) return;

    const mesh = meshRef.current;
    const u = materialRef.current.uniforms;

    // ---- Depth pre-pass ----
    // Only do the pass if rim foam is actually enabled; otherwise skip to save
    // ~50% GPU cost for scenes that don't need intersection foam.
    if (u.uRimWidth.value > 0.0001) {
      const wasVisible = mesh.visible;
      mesh.visible = false;
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(depthRT);
      gl.clear();
      gl.render(scene, camera);
      gl.setRenderTarget(prev);
      mesh.visible = wasVisible;

      u.uResolution.value.set(depthRT.width, depthRT.height);
      u.uCameraNear.value = (camera as THREE.PerspectiveCamera).near;
      u.uCameraFar.value = (camera as THREE.PerspectiveCamera).far;
    }

    u.uTime.value = clock.getElapsedTime();
    if (funnelCenter?.current) {
      const c = funnelCenter.current;
      u.uFunnelCenter.value.set(c.x, c.z);
    }
  });

  return (
    <mesh
      ref={meshRef}
      rotation-x={-Math.PI / 2}
      position-y={waterLevel}
      renderOrder={-1}
    >
      <planeGeometry args={[size, size, 128, 128]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}
