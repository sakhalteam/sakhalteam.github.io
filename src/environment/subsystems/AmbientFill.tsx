// environment/subsystems/AmbientFill.tsx

import { useAtmosphere } from "../AtmosphereContext";

export default function AmbientFill() {
  const { params } = useAtmosphere();
  return (
    <ambientLight
      intensity={params.ambientIntensity}
      color={params.ambientColor}
    />
  );
}
