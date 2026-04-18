// environment/subsystems/SunLight.tsx
//
// Directional key light. Position is driven by the sun direction; shadow
// frustum is a centered box so objects inside the scene extents cast clean
// shadows regardless of sun angle.

import { useMemo } from "react";
import * as THREE from "three";
import { useAtmosphere } from "../AtmosphereContext";

const DISTANCE = 80;
const FRUSTUM_SIZE = 45;
const SHADOW_MAP_SIZE = 2048;

export default function SunLight() {
  const { params } = useAtmosphere();

  // Below-horizon sun shouldn't light the scene (moon picks that up via
  // ambient shift). Ramp intensity down as the sun dips.
  const horizonFade = THREE.MathUtils.clamp(
    THREE.MathUtils.smoothstep(params.sunPosition.y, -0.18, 0.32),
    0,
    1,
  );
  const intensity = params.sunIntensity * horizonFade;

  const shadowCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(
      -FRUSTUM_SIZE,
      FRUSTUM_SIZE,
      FRUSTUM_SIZE,
      -FRUSTUM_SIZE,
      1,
      DISTANCE * 3,
    );
    return cam;
  }, []);

  return (
    <directionalLight
      position={[
        params.sunPosition.x * DISTANCE,
        Math.max(params.sunPosition.y, 0.05) * DISTANCE,
        params.sunPosition.z * DISTANCE,
      ]}
      intensity={intensity}
      color={params.sunColor}
      castShadow
      shadow-mapSize-width={SHADOW_MAP_SIZE}
      shadow-mapSize-height={SHADOW_MAP_SIZE}
      shadow-bias={-0.0005}
      shadow-normalBias={0.02}
    >
      <primitive object={shadowCamera} attach="shadow-camera" />
    </directionalLight>
  );
}
