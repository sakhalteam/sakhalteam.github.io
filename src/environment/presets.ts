// environment/presets.ts
//
// Single source of truth for atmosphere semantics.
//
// Time is continuous (hour 0..24), not a discrete enum. Params are derived
// from smooth interpolation across a handful of anchor times, so we avoid the
// abrupt day -> sunset -> night snaps a discrete enum would force.
// Weather stays discrete (clear / partly_cloudy / overcast / rainy / stormy)
// and layers on top as modifiers + tints.

import * as THREE from "three";

//#region types

export type TimeOfDay = "dawn" | "morning" | "noon" | "sunset" | "night";
export type Weather =
  | "clear"
  | "partly_cloudy"
  | "overcast"
  | "rainy"
  | "stormy";

export type AtmosphereSubsystem =
  | "sky"
  | "sun"
  | "ambient"
  | "clouds"
  | "sky_clouds"
  | "celestials"
  | "stars"
  | "fog";

export const WEATHERS: Weather[] = [
  "clear",
  "partly_cloudy",
  "overcast",
  "rainy",
  "stormy",
];

export const WEATHER_LABELS: Record<Weather, string> = {
  clear: "Clear",
  partly_cloudy: "Partly Cloudy",
  overcast: "Overcast",
  rainy: "Rainy",
  stormy: "Stormy",
};

/** Convenience -> hour-of-day mapping for sceneMap defaults. */
export const TIME_OF_DAY_HOURS: Record<TimeOfDay, number> = {
  dawn: 6,
  morning: 9,
  noon: 12,
  sunset: 19,
  night: 23,
};

export interface AtmosphereParams {
  sunPosition: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  cloudCover: number;
  cloudColor: THREE.Color;
  cloudOpacity: number;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  fogEnabled: boolean;
  starOpacity: number;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  phaseLabel: string;
}

interface TimeAnchor {
  hour: number;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  rayleigh: number;
  turbidity: number;
  starOpacity: number;
  cloudTint: string;
  skyZenith: string;
  skyHorizon: string;
}

const TIME_ANCHORS: TimeAnchor[] = [
  {
    hour: 0,
    sunColor: "#a3b8ff",
    sunIntensity: 0.25,
    ambientColor: "#14223a",
    ambientIntensity: 0.3,
    rayleigh: 0.5,
    turbidity: 0.5,
    starOpacity: 1,
    cloudTint: "#1a2740",
    skyZenith: "#05080f",
    skyHorizon: "#0c1830",
  },
  {
    hour: 4.5,
    sunColor: "#c6a6ff",
    sunIntensity: 0.35,
    ambientColor: "#2a2f52",
    ambientIntensity: 0.38,
    rayleigh: 1.2,
    turbidity: 4,
    starOpacity: 0.7,
    cloudTint: "#6b5c84",
    skyZenith: "#1a1a3a",
    skyHorizon: "#5a4a6e",
  },
  {
    hour: 6,
    sunColor: "#ff9a5a",
    sunIntensity: 0.75,
    ambientColor: "#ffb088",
    ambientIntensity: 0.48,
    rayleigh: 3,
    turbidity: 8,
    starOpacity: 0.15,
    cloudTint: "#e0896a",
    skyZenith: "#3a5a8a",
    skyHorizon: "#ffae6a",
  },
  {
    hour: 9,
    sunColor: "#fff1d9",
    sunIntensity: 1.05,
    ambientColor: "#d8e2ef",
    ambientIntensity: 0.55,
    rayleigh: 2.5,
    turbidity: 7,
    starOpacity: 0,
    cloudTint: "#ffffff",
    skyZenith: "#3380c8",
    skyHorizon: "#bcd8ec",
  },
  {
    hour: 12,
    sunColor: "#ffffff",
    sunIntensity: 1.15,
    ambientColor: "#cfd8e3",
    ambientIntensity: 0.6,
    rayleigh: 2,
    turbidity: 6,
    starOpacity: 0,
    cloudTint: "#ffffff",
    skyZenith: "#1f6fd0",
    skyHorizon: "#a8cce8",
  },
  {
    hour: 16,
    sunColor: "#fff0d0",
    sunIntensity: 1.05,
    ambientColor: "#d7dde5",
    ambientIntensity: 0.55,
    rayleigh: 2.5,
    turbidity: 7,
    starOpacity: 0,
    cloudTint: "#fbeede",
    skyZenith: "#2a78c4",
    skyHorizon: "#dcc89a",
  },
  {
    hour: 17.5,
    sunColor: "#ff7a3d",
    sunIntensity: 0.8,
    ambientColor: "#ff9a6a",
    ambientIntensity: 0.42,
    rayleigh: 3,
    turbidity: 10,
    starOpacity: 0.2,
    cloudTint: "#d85a42",
    skyZenith: "#3a4f8a",
    skyHorizon: "#ff6a30",
  },
  {
    hour: 19,
    sunColor: "#8a6aff",
    sunIntensity: 0.4,
    ambientColor: "#3a3560",
    ambientIntensity: 0.38,
    rayleigh: 1.5,
    turbidity: 5,
    starOpacity: 0.7,
    cloudTint: "#4a3c64",
    skyZenith: "#161838",
    skyHorizon: "#5a3858",
  },
  {
    hour: 24,
    sunColor: "#a3b8ff",
    sunIntensity: 0.25,
    ambientColor: "#14223a",
    ambientIntensity: 0.3,
    rayleigh: 0.5,
    turbidity: 0.5,
    starOpacity: 1,
    cloudTint: "#1a2740",
    skyZenith: "#05080f",
    skyHorizon: "#0c1830",
  },
];

interface WeatherMod {
  turbidityAdd: number;
  rayleighMul: number;
  sunIntensityMul: number;
  ambientIntensityMul: number;
  cloudCover: number;
  cloudOpacity: number;
  cloudTintMul: string;
  fogEnabled: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
}

//#endregion types

const WEATHER_MODS: Record<Weather, WeatherMod> = {
  clear: {
    turbidityAdd: 0,
    rayleighMul: 1,
    sunIntensityMul: 1,
    ambientIntensityMul: 1,
    cloudCover: 0,
    cloudOpacity: 0.85,
    cloudTintMul: "#ffffff",
    fogEnabled: false,
    fogColor: "#bcd0e6",
    fogNear: 60,
    fogFar: 200,
  },
  partly_cloudy: {
    turbidityAdd: 1,
    rayleighMul: 1,
    sunIntensityMul: 0.95,
    ambientIntensityMul: 1,
    cloudCover: 0.4,
    cloudOpacity: 0.85,
    cloudTintMul: "#ffffff",
    fogEnabled: false,
    fogColor: "#bcd0e6",
    fogNear: 60,
    fogFar: 200,
  },
  overcast: {
    turbidityAdd: 5,
    rayleighMul: 0.45,
    sunIntensityMul: 0.5,
    ambientIntensityMul: 1.1,
    cloudCover: 0.92,
    cloudOpacity: 0.95,
    cloudTintMul: "#b8bfc6",
    fogEnabled: true,
    fogColor: "#aab5c0",
    fogNear: 40,
    fogFar: 160,
  },
  rainy: {
    turbidityAdd: 7,
    rayleighMul: 0.35,
    sunIntensityMul: 0.38,
    ambientIntensityMul: 1.0,
    cloudCover: 0.95,
    cloudOpacity: 0.95,
    cloudTintMul: "#7f8892",
    fogEnabled: true,
    fogColor: "#7e8893",
    fogNear: 30,
    fogFar: 120,
  },
  stormy: {
    turbidityAdd: 9,
    rayleighMul: 0.3,
    sunIntensityMul: 0.28,
    ambientIntensityMul: 0.9,
    cloudCover: 0.97,
    cloudOpacity: 0.98,
    cloudTintMul: "#555e67",
    fogEnabled: true,
    fogColor: "#5e6770",
    fogNear: 25,
    fogFar: 100,
  },
};

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorMul = new THREE.Color();

function lerpColorHex(a: string, b: string, t: number): THREE.Color {
  _colorA.set(a);
  _colorB.set(b);
  return _colorA.clone().lerp(_colorB, t);
}

function multiplyColor(base: THREE.Color, mulHex: string): THREE.Color {
  _colorMul.set(mulHex);
  return base.clone().multiply(_colorMul);
}

function findAnchorPair(hour: number): {
  a: TimeAnchor;
  b: TimeAnchor;
  t: number;
} {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < TIME_ANCHORS.length - 1; i++) {
    const a = TIME_ANCHORS[i];
    const b = TIME_ANCHORS[i + 1];
    if (h >= a.hour && h <= b.hour) {
      return { a, b, t: smoothstep(a.hour, b.hour, h) };
    }
  }
  const last = TIME_ANCHORS[TIME_ANCHORS.length - 1];
  return { a: last, b: last, t: 0 };
}

function phaseLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h >= 21.5) return "Nighttime";
  if (h < 8) return "Sunrise";
  if (h < 17.5) return "Midday";
  if (h < 20.5) return "Sunset";
  return "Dusk";
}

const MAX_ELEVATION_DEG = 65;
const NIGHT_DIP_DEG = 30;
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 18;
const DAYLIGHT_HOURS = SUNSET_HOUR - SUNRISE_HOUR;
const NIGHT_HOURS = 24 - DAYLIGHT_HOURS;

function sunDirection(hour: number): THREE.Vector3 {
  const h = ((hour % 24) + 24) % 24;
  const sinceSunrise = (((h - SUNRISE_HOUR) % 24) + 24) % 24;

  let elev: number;
  let azim: number;

  if (sinceSunrise <= DAYLIGHT_HOURS) {
    const progress = smoothstep(0, DAYLIGHT_HOURS, sinceSunrise);
    elev = THREE.MathUtils.degToRad(
      Math.sin(progress * Math.PI) * MAX_ELEVATION_DEG,
    );
    azim = lerp(-Math.PI / 2, Math.PI / 2, progress);
  } else {
    const progress = smoothstep(0, NIGHT_HOURS, sinceSunrise - DAYLIGHT_HOURS);
    elev = THREE.MathUtils.degToRad(
      -Math.sin(progress * Math.PI) * NIGHT_DIP_DEG,
    );
    azim = lerp(Math.PI / 2, Math.PI * 1.5, progress);
  }

  const x = Math.cos(elev) * Math.sin(azim);
  const y = Math.sin(elev);
  const z = Math.cos(elev) * Math.cos(azim);
  return new THREE.Vector3(x, y, z).normalize();
}

export function resolveAtmosphere(
  hour: number,
  weather: Weather,
): AtmosphereParams {
  const { a, b, t } = findAnchorPair(hour);
  const w = WEATHER_MODS[weather];

  const rayleigh = lerp(a.rayleigh, b.rayleigh, t) * w.rayleighMul;
  const turbidity = lerp(a.turbidity, b.turbidity, t) + w.turbidityAdd;
  const sunIntensity =
    lerp(a.sunIntensity, b.sunIntensity, t) * w.sunIntensityMul;
  const ambientIntensity =
    lerp(a.ambientIntensity, b.ambientIntensity, t) * w.ambientIntensityMul;
  const starOpacity = lerp(a.starOpacity, b.starOpacity, t);

  const sunColor = lerpColorHex(a.sunColor, b.sunColor, t);
  const ambientColor = lerpColorHex(a.ambientColor, b.ambientColor, t);
  const baseCloud = lerpColorHex(a.cloudTint, b.cloudTint, t);
  const cloudColor = multiplyColor(baseCloud, w.cloudTintMul);
  const skyZenith = lerpColorHex(a.skyZenith, b.skyZenith, t);
  const skyHorizon = lerpColorHex(a.skyHorizon, b.skyHorizon, t);

  return {
    sunPosition: sunDirection(hour),
    sunColor,
    sunIntensity,
    turbidity,
    rayleigh,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.75,
    ambientColor,
    ambientIntensity,
    cloudCover: w.cloudCover,
    cloudColor,
    cloudOpacity: w.cloudOpacity,
    fogColor: new THREE.Color(w.fogColor),
    fogNear: w.fogNear,
    fogFar: w.fogFar,
    fogEnabled: w.fogEnabled,
    starOpacity,
    skyZenith,
    skyHorizon,
    phaseLabel: phaseLabel(hour),
  };
}

/** Convert a convenience TimeOfDay label into an hour for sceneMap defaults. */
export function hourFromTimeOfDay(t: TimeOfDay): number {
  return TIME_OF_DAY_HOURS[t];
}
