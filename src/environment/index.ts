// environment/index.ts — public surface

export { default as Atmosphere, DEFAULT_SUBSYSTEMS } from "./Atmosphere";
export { AtmosphereProvider, useAtmosphere } from "./AtmosphereContext";
export { default as AtmospherePanel } from "./AtmospherePanel";
export { resolveAtmosphere, WEATHERS, WEATHER_LABELS } from "./presets";
export type {
  AtmosphereParams,
  AtmosphereSubsystem,
  Weather,
} from "./presets";
