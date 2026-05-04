// environment/Atmosphere.tsx
//
// Composition layer: mounts the requested atmosphere subsystems inside the
// Canvas. New subsystems (rain, lightning, constellations, etc.) plug in by
// adding a file to ./subsystems and an entry to REGISTRY. Zone-specific
// experimental effects can also be passed as children.
//
// Per-subsystem options: zones can pass a partial props object via
// AtmosphereConfig.options[subsystemKey] in sceneMap.ts; we spread it
// onto the mounted subsystem. See sceneMap's SubsystemOptions type.

import { type ComponentType, type ReactNode } from "react";
import type { AtmosphereSubsystem } from "./presets";
import GradientSky from "./subsystems/GradientSky";
import SunLight from "./subsystems/SunLight";
import AmbientFill from "./subsystems/AmbientFill";
import DriftClouds from "./subsystems/DriftClouds";
import SpriteDrift from "./subsystems/SpriteDrift";
import SkyClouds from "./subsystems/SkyClouds";
import Celestials from "./subsystems/Celestials";
import Stars from "./subsystems/Stars";
import Fog from "./subsystems/Fog";

export const DEFAULT_SUBSYSTEMS: AtmosphereSubsystem[] = [
  "sky",
  "sun",
  "ambient",
];

// Loosely typed at the registry layer because each subsystem accepts a
// different prop shape. Per-subsystem prop types are checked at the
// AtmosphereConfig.options call site (see sceneMap's SubsystemOptions).
const REGISTRY: Record<AtmosphereSubsystem, ComponentType<any>> = {
  sky: GradientSky,
  sun: SunLight,
  ambient: AmbientFill,
  clouds: DriftClouds,
  sprite_drift: SpriteDrift,
  sky_clouds: SkyClouds,
  celestials: Celestials,
  stars: Stars,
  fog: Fog,
};

interface Props {
  enabled?: AtmosphereSubsystem[];
  /** Per-subsystem options, keyed by subsystem name. */
  options?: Partial<Record<AtmosphereSubsystem, Record<string, unknown>>>;
  /** Optional zone-specific extras (constellation overlay, custom particles, etc.) */
  children?: ReactNode;
}

export default function Atmosphere({
  enabled = DEFAULT_SUBSYSTEMS,
  options,
  children,
}: Props) {
  return (
    <>
      {enabled.map((key) => {
        const Sub = REGISTRY[key];
        if (!Sub) return null;
        const subOptions = options?.[key] ?? {};
        return <Sub key={key} {...subOptions} />;
      })}
      {children}
    </>
  );
}
