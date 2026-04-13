import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 csm_vUv;

  uniform float uTime;
  uniform float uWaveSpeed;
  uniform float uWaveAmplitude;

  void main() {
    csm_vUv = uv;

    vec3 modifiedPosition = position;

    // Distance from island center (local XY = world XZ since plane is rotated)
    float shoreDist = length(position.xy);

    // Two overlapping sine waves for organic motion
    float wave1 = sin(position.x * 0.8 + uTime * uWaveSpeed) * uWaveAmplitude;
    float wave2 = sin(position.y * 0.6 + uTime * uWaveSpeed * 0.7 + 1.5) * uWaveAmplitude * 0.6;

    // Dampen waves near the shoreline so they don't flood the beach
    float waveScale = smoothstep(4.0, 8.0, shoreDist);
    modifiedPosition.z += (wave1 + wave2) * waveScale;

    // Push water surface down near the island to prevent beach submersion
    float shoreDepression = smoothstep(7.0, 3.0, shoreDist) * 0.12;
    modifiedPosition.z -= shoreDepression;

    csm_Position = modifiedPosition;
  }
`;

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
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    vec3 finalColor = csm_FragColor.rgb;
    float alpha = csm_FragColor.a;

    float textureSize = 100.0 - uTextureSize;

    // Foam islands
    float noiseBase = noise(csm_vUv * (textureSize * 2.8) + sin(uTime * 0.3));
    vec3 colorBase = vec3(noiseBase);
    vec3 foam = smoothstep(0.08, 0.001, colorBase);
    foam = step(0.5, foam);

    // Wave lines
    float noiseWaves = noise(csm_vUv * textureSize + sin(uTime * -0.1));
    vec3 colorWaves = vec3(noiseWaves);
    float threshold = 0.6 + 0.01 * sin(uTime * 2.0);
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
    vec3 baseColor = mix(finalColor, uColorFar, smoothstep(0.1, 0.4, dist));

    // Suppress foam/waves near edges
    combinedEffect = mix(combinedEffect, vec3(0.0), edgeFade);

    finalColor = (1.0 - combinedEffect) * baseColor + combinedEffect;

    // Fade alpha at edges for soft boundary
    alpha *= (1.0 - edgeFade);

    csm_FragColor = vec4(finalColor, alpha);
  }
`;

interface WaterProps {
  /** Y position of the water plane */
  waterLevel?: number;
  /** Size of the plane (will be square) */
  size?: number;
}

export default function Water({ waterLevel = -0.03, size = 80 }: WaterProps) {
  const materialRef = useRef<CustomShaderMaterial>(null);

  const material = useMemo(() => {
    return new CustomShaderMaterial({
      baseMaterial: THREE.MeshStandardMaterial,
      vertexShader,
      fragmentShader,
      color: "#00fccd",
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWaveSpeed: { value: 0.8 },
        uWaveAmplitude: { value: 0.04 },
        uColorFar: { value: new THREE.Color("#0b6fb8") },
        uTextureSize: { value: 92.0 },
      },
    });
  }, []);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={waterLevel} renderOrder={-1}>
      <planeGeometry args={[size, size, 128, 128]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}
