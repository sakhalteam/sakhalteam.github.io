// useLightingControls.ts
//
// Shared leva lighting panel for IslandScene and every non-atmosphere zone.
// One source of truth for the schema, defaults, persistence, and the
// "📋 copy as defaults" button.
//
// Each consumer passes a unique `scope` key — that drives both the leva
// folder name and the localStorage bucket. Tweaking Reading Room's lighting
// won't affect the island, and reloads keep your changes.
//
// LIGHTING_DEFAULTS at the top is the EXACT 4/22 baseline that proved out
// after the OutlinePass dimming saga — keep it as the fallback for any
// scope without persisted values.

import { button, useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import { showToast } from "./toastStore";

export interface LightingValues {
  envPreset: string;
  envIntensity: number;
  sunIntensity: number;
  sunColor: string;
  sunX: number;
  sunY: number;
  sunZ: number;
  fillIntensity: number;
  fillColor: string;
  ambientIntensity: number;
}

export const LIGHTING_DEFAULTS: LightingValues = {
  envPreset: "night",
  envIntensity: 1.0,
  sunIntensity: 1.2,
  sunColor: "#ffffff",
  sunX: 6,
  sunY: 10,
  sunZ: 4,
  fillIntensity: 0.3,
  fillColor: "#4488ff",
  ambientIntensity: 0.6,
};

const ENV_PRESETS = [
  "apartment",
  "city",
  "dawn",
  "forest",
  "lobby",
  "night",
  "park",
  "studio",
  "sunset",
  "warehouse",
];

const STORAGE_PREFIX = "sakhalteam.lighting.";

function readStored(scope: string): Partial<LightingValues> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + scope);
    return raw ? (JSON.parse(raw) as Partial<LightingValues>) : {};
  } catch {
    return {};
  }
}

function writeStored(scope: string, values: LightingValues) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + scope,
      JSON.stringify(values),
    );
  } catch {
    // Quota / privacy-mode failures: drop silently.
  }
}

/**
 * Format current lighting values as a paste-ready code block. The output
 * matches the shape of LIGHTING_DEFAULTS so the user can wholesale-replace
 * the block at the top of useLightingControls.ts to bake new defaults in.
 */
function formatDefaultsBlock(values: LightingValues): string {
  const fmt = (v: unknown) =>
    typeof v === "string" ? JSON.stringify(v) : String(v);
  return [
    "export const LIGHTING_DEFAULTS: LightingValues = {",
    `  envPreset: ${fmt(values.envPreset)},`,
    `  envIntensity: ${fmt(values.envIntensity)},`,
    `  sunIntensity: ${fmt(values.sunIntensity)},`,
    `  sunColor: ${fmt(values.sunColor)},`,
    `  sunX: ${fmt(values.sunX)},`,
    `  sunY: ${fmt(values.sunY)},`,
    `  sunZ: ${fmt(values.sunZ)},`,
    `  fillIntensity: ${fmt(values.fillIntensity)},`,
    `  fillColor: ${fmt(values.fillColor)},`,
    `  ambientIntensity: ${fmt(values.ambientIntensity)},`,
    "};",
  ].join("\n");
}

/**
 * Mount the lighting leva panel for a scene. `scope` keys the persistence
 * bucket and leva folder name (e.g. "island" or "zone:nessie").
 *
 * `locationLabel` is the human-friendly file location shown in the toast
 * after a copy — e.g. "src/IslandScene.tsx → IslandLighting()".
 *
 * `seedDefaults` lets the caller override individual fallback values for
 * this scope (e.g. ZoneScene seeds `envPreset` from the zone's sceneMap
 * `env` field so first-time visitors see the same look as before).
 * Stored values still win over seeds.
 */
export function useLightingControls(
  scope: string,
  locationLabel: string,
  seedDefaults?: Partial<LightingValues>,
): LightingValues {
  const stored = useMemo(() => readStored(scope), [scope]);
  const seeded = useMemo<LightingValues>(
    () => ({ ...LIGHTING_DEFAULTS, ...seedDefaults }),
    // We intentionally only re-seed when scope changes — seedDefaults
    // is a fresh object on every render in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope],
  );
  const folder = `lighting · ${scope}`;

  // The button callback runs at click-time; capture the latest values via
  // a ref so we don't snapshot the schema-creation moment.
  const valuesRef = useRef<LightingValues>(LIGHTING_DEFAULTS);

  const values = useControls(
    folder,
    {
      envPreset: {
        value: stored.envPreset ?? seeded.envPreset,
        options: ENV_PRESETS,
      },
      envIntensity: {
        value: stored.envIntensity ?? seeded.envIntensity,
        min: 0,
        max: 3,
        step: 0.05,
      },
      sunIntensity: {
        value: stored.sunIntensity ?? seeded.sunIntensity,
        min: 0,
        max: 5,
        step: 0.05,
      },
      sunColor: stored.sunColor ?? seeded.sunColor,
      sunX: {
        value: stored.sunX ?? seeded.sunX,
        min: -20,
        max: 20,
        step: 0.5,
      },
      sunY: {
        value: stored.sunY ?? seeded.sunY,
        min: 0,
        max: 30,
        step: 0.5,
      },
      sunZ: {
        value: stored.sunZ ?? seeded.sunZ,
        min: -20,
        max: 20,
        step: 0.5,
      },
      fillIntensity: {
        value: stored.fillIntensity ?? seeded.fillIntensity,
        min: 0,
        max: 2,
        step: 0.05,
      },
      fillColor: stored.fillColor ?? seeded.fillColor,
      ambientIntensity: {
        value: stored.ambientIntensity ?? seeded.ambientIntensity,
        min: 0,
        max: 2,
        step: 0.05,
      },
      "📋 copy as defaults": button(() => {
        const text = formatDefaultsBlock(valuesRef.current);
        const fail = (reason?: unknown) => {
          showToast("Clipboard write failed — values logged to console.");
          console.warn("[lighting] copy failed", reason);
          console.log(text);
        };
        if (
          typeof navigator === "undefined" ||
          !navigator.clipboard?.writeText
        ) {
          fail("no clipboard API");
          return;
        }
        navigator.clipboard
          .writeText(text)
          .then(() => {
            showToast(
              `Copied! Paste into ${locationLabel} (replace the LIGHTING_DEFAULTS block in src/useLightingControls.ts to make these the new fallback for every scene without persisted values).`,
            );
          })
          .catch(fail);
      }),
    },
    [scope],
  ) as unknown as LightingValues;

  valuesRef.current = values;

  useEffect(() => {
    writeStored(scope, values);
  }, [scope, values]);

  return values;
}
