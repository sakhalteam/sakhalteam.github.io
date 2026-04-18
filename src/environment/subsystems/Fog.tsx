// environment/subsystems/Fog.tsx

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { useAtmosphere } from "../AtmosphereContext";

export default function Fog() {
  const { params } = useAtmosphere();
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    if (!params.fogEnabled) {
      scene.fog = null;
      return;
    }
    scene.fog = new THREE.Fog(
      params.fogColor,
      params.fogNear,
      params.fogFar,
    );
    return () => {
      scene.fog = null;
    };
  }, [
    scene,
    params.fogEnabled,
    params.fogColor,
    params.fogNear,
    params.fogFar,
  ]);

  return null;
}
