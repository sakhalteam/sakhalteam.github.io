// environment/subsystems/GradientSky.tsx
//
// Stylized sky dome. Replaces drei <Sky>'s physical scattering with an
// art-directable gradient: horizon -> zenith blend, plus a sun glow + warm
// horizon spread that grows when the sun is low. Tuned via skyZenith /
// skyHorizon / sunColor in presets.ts — no rayleigh/turbidity guesswork.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAtmosphere } from "../AtmosphereContext";

const VERT = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorldDir;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;

void main() {
  vec3 dir = normalize(vWorldDir);
  float up = dir.y;

  // Single continuous gradient: horizon colour below, zenith colour above,
  // smoothly blended across a wide band biased slightly south of the equator
  // so a straight-ahead camera already reads as "sky", not "horizon haze".
  // Anything past the blend range resolves to solid uHorizon (below) or
  // uZenith (above), with no hard seam at the equator.
  float t = smoothstep(-0.45, 0.35, up);
  vec3 sky = mix(uHorizon, uZenith, t);

  // Sun terms.
  float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
  float sunDisc = smoothstep(0.9985, 0.9995, sunDot);
  float sunGlow = pow(sunDot, 12.0) * 0.55;

  // Warm horizon spread: only when sun is near/below horizon, biased to
  // pixels near the horizon. Gives the cinematic sunset bloom drei <Sky>
  // can't paint without going dark everywhere else.
  float sunLow = 1.0 - smoothstep(-0.1, 0.4, uSunDir.y);
  float horizonBand = 1.0 - smoothstep(0.0, 0.35, abs(up));
  float warmth = sunLow * horizonBand * pow(sunDot, 1.5) * 0.9;

  sky += uSunColor * (sunDisc + sunGlow + warmth);

  gl_FragColor = vec4(sky, 1.0);
}
`;

interface Props {
  /** Dome radius. Big enough that it sits behind everything. */
  radius?: number;
}

export default function GradientSky({ radius = 800 }: Props) {
  const { params } = useAtmosphere();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uZenith: { value: params.skyZenith.clone() },
          uHorizon: { value: params.skyHorizon.clone() },
          uSunColor: { value: params.sunColor.clone() },
          uSunDir: { value: params.sunPosition.clone() },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame(() => {
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).copy(params.skyZenith);
    (u.uHorizon.value as THREE.Color).copy(params.skyHorizon);
    (u.uSunColor.value as THREE.Color).copy(params.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(params.sunPosition);
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
