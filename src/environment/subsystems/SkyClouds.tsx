// environment/subsystems/SkyClouds.tsx
//
// High-altitude animated cloud layer. A large horizontal plane above the
// scene running an FBM simplex-noise shader. Tint + cover + opacity come
// from the atmosphere params so weather + time-of-day affect the layer
// without any per-zone tuning.
//
// This is separate from DriftClouds: that's low-altitude puff clouds (drei),
// this is the wispy sky canopy you see stretching to the horizon.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAtmosphere } from "../AtmosphereContext";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// snoise (Ashima 2D simplex) - classic single-file implementation.
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uCover;     // 0..1
uniform float uOpacity;   // 0..1
uniform vec3  uTint;      // cloud color
uniform vec3  uSkyTint;   // color under-sky at cloud height (for edge blending)

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vUv * 4.0;
  // Two layers drifting in slightly different directions -> swirling look.
  float n1 = fbm(p + vec2(uTime * 0.015, uTime * 0.008));
  float n2 = fbm(p * 1.8 - vec2(uTime * 0.02, uTime * 0.012));
  float n = 0.6 * n1 + 0.4 * n2;
  n = n * 0.5 + 0.5; // 0..1

  float cover = clamp(uCover, 0.0, 1.0);
  // Keep low-cover weather genuinely sparse instead of painting the whole sky
  // with haze. As cover rises we lower the threshold and widen the feather.
  float threshold = mix(1.02, 0.34, cover);
  float feather = mix(0.05, 0.22, cover);
  float mask = smoothstep(threshold, threshold + feather, n);
  mask *= smoothstep(0.05, 0.16, cover);
  mask = pow(mask, mix(1.8, 0.9, cover));

  // Radial fade toward horizon edges so the plane never shows a hard edge.
  vec2 c = vUv - 0.5;
  float edge = 1.0 - smoothstep(0.35, 0.5, length(c));

  vec3 col = mix(uSkyTint, uTint, smoothstep(0.18, 0.9, mask));
  float alpha = mask * uOpacity * edge;

  gl_FragColor = vec4(col, alpha);
}
`;

interface Props {
  /** Height above origin the cloud plane sits at. */
  altitude?: number;
  /** Plane size (large enough to reach the horizon). */
  size?: number;
}

export default function SkyClouds({
  altitude = 120,
  size = 2000,
}: Props) {
  const { params } = useAtmosphere();

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCover: { value: params.cloudCover },
        uOpacity: { value: params.cloudOpacity },
        uTint: { value: params.cloudColor.clone() },
        uSkyTint: { value: params.ambientColor.clone() },
      },
    });
    // Intentionally stable across re-renders - uniforms update in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dt) => {
    const u = material.uniforms;
    u.uTime.value += dt;
    u.uCover.value = params.cloudCover;
    u.uOpacity.value = params.cloudOpacity;
    (u.uTint.value as THREE.Color).copy(params.cloudColor);
    (u.uSkyTint.value as THREE.Color).copy(params.ambientColor);
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, altitude, 0]}
      renderOrder={-1}
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
