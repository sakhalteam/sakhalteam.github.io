// environment/subsystems/SkyDome.tsx

import { Sky } from "@react-three/drei";
import { useAtmosphere } from "../AtmosphereContext";

export default function SkyDome() {
  const { params } = useAtmosphere();
  return (
    <Sky
      distance={900}
      sunPosition={[
        params.sunPosition.x,
        params.sunPosition.y,
        params.sunPosition.z,
      ]}
      turbidity={params.turbidity}
      rayleigh={params.rayleigh}
      mieCoefficient={params.mieCoefficient}
      mieDirectionalG={params.mieDirectionalG}
    />
  );
}
