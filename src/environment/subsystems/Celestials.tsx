// environment/subsystems/Celestials.tsx
//
// Visible sun + moon billboards. The sun sits at the sun-direction.
// The moon mirrors it (opposite side of sky) so when the sun drops below
// the horizon, the moon rises on the other side. Both use radial-gradient
// canvas textures for a soft glow with a hot core.

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAtmosphere } from "../AtmosphereContext";

const DISTANCE = 450;

function radialGlowTexture(coreHex: string, glowHex: string): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0.0, coreHex);
  grad.addColorStop(0.25, glowHex);
  grad.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export default function Celestials() {
  const { params } = useAtmosphere();

  const sunTexture = useMemo(
    () => radialGlowTexture("rgba(255,255,240,1)", "rgba(255,190,120,0.85)"),
    [],
  );
  const moonTexture = useMemo(
    () => radialGlowTexture("rgba(240,244,255,1)", "rgba(170,190,230,0.8)"),
    [],
  );

  const sunMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: sunTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [sunTexture],
  );
  const moonMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: moonTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [moonTexture],
  );

  const sunRef = useMemo(() => new THREE.Sprite(sunMat), [sunMat]);
  const moonRef = useMemo(() => new THREE.Sprite(moonMat), [moonMat]);

  useFrame(() => {
    const sunDir = params.sunPosition;
    const sunY = sunDir.y;

    // Sun: visible above horizon, fading as it drops.
    const sunAlpha = THREE.MathUtils.clamp(
      THREE.MathUtils.smoothstep(sunY, -0.18, 0.28),
      0,
      1,
    );
    sunRef.position.set(
      sunDir.x * DISTANCE,
      sunDir.y * DISTANCE,
      sunDir.z * DISTANCE,
    );
    const sunSize = 55;
    sunRef.scale.set(sunSize, sunSize, 1);
    sunMat.opacity = sunAlpha;
    sunMat.color.copy(params.sunColor);

    // Moon: mirror of sun direction, visible when sun is below horizon.
    const moonAlpha = THREE.MathUtils.clamp(
      1 - THREE.MathUtils.smoothstep(sunY, -0.2, 0.3),
      0,
      1,
    );
    moonRef.position.set(
      -sunDir.x * DISTANCE,
      Math.max(0.15, -sunDir.y) * DISTANCE,
      -sunDir.z * DISTANCE,
    );
    const moonSize = 45;
    moonRef.scale.set(moonSize, moonSize, 1);
    moonMat.opacity = moonAlpha * 0.9;
  });

  return (
    <>
      <primitive object={sunRef} />
      <primitive object={moonRef} />
    </>
  );
}
