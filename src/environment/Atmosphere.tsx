// environment/Atmosphere.tsx
//
// Composition layer: mounts the requested atmosphere subsystems inside the
// Canvas. New subsystems (rain, lightning, constellations, etc.) plug in by
// adding a file to ./subsystems and an entry to REGISTRY. Zone-specific
// experimental effects can also be passed as children.

import { type ComponentType, type ReactNode } from "react";
import type { AtmosphereSubsystem } from "./presets";
import GradientSky from "./subsystems/GradientSky";
import SunLight from "./subsystems/SunLight";
import AmbientFill from "./subsystems/AmbientFill";
import DriftClouds from "./subsystems/DriftClouds";
import SkyClouds from "./subsystems/SkyClouds";
import Celestials from "./subsystems/Celestials";
import Stars from "./subsystems/Stars";
import Fog from "./subsystems/Fog";

export const DEFAULT_SUBSYSTEMS: AtmosphereSubsystem[] = [
  "sky",
  "sun",
  "ambient",
];

const REGISTRY: Record<AtmosphereSubsystem, ComponentType> = {
  sky: GradientSky,
  sun: SunLight,
  ambient: AmbientFill,
  clouds: DriftClouds,
  sky_clouds: SkyClouds,
  celestials: Celestials,
  stars: Stars,
  fog: Fog,
};

interface Props {
  enabled?: AtmosphereSubsystem[];
  /** Optional zone-specific extras (constellation overlay, custom particles, etc.) */
  children?: ReactNode;
}

export default function Atmosphere({
  enabled = DEFAULT_SUBSYSTEMS,
  children,
}: Props) {
  return (
    <>
      {enabled.map((key) => {
        const Sub = REGISTRY[key];
        return Sub ? <Sub key={key} /> : null;
      })}
      {children}
    </>
  );
}
