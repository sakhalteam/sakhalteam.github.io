// environment/subsystems/Stars.tsx

import { Stars as DreiStars } from "@react-three/drei";
import { useAtmosphere } from "../AtmosphereContext";

export default function Stars() {
  const { params } = useAtmosphere();
  if (params.starOpacity <= 0.01) return null;
  return (
    <DreiStars
      radius={300}
      depth={60}
      count={Math.round(3000 * params.starOpacity)}
      factor={4}
      saturation={0}
      fade
      speed={0.4}
    />
  );
}
