import { BlendFunction, KernelSize } from "postprocessing";
import type { OutlineSettings } from "./Outline";

export type OutlineKind = "active" | "inactive" | "toy";

export const BASE_OUTLINE_SETTINGS: OutlineSettings = {
  enabled: true,
  blur: false,
  xRay: false,
  edgeStrength: 8.0,
  edgeThickness: 2.5,
  edgeGlow: 0.3,
  pulseSpeed: 0,
  hiddenEdgeColor: 0x000000,
  width: undefined,
  height: undefined,
  kernelSize: KernelSize.SMALL,
  blendFunction: BlendFunction.ALPHA,
  patternTexture: undefined,
};

export const OUTLINE_STYLES: Record<OutlineKind, OutlineSettings> = {
  active: {
    ...BASE_OUTLINE_SETTINGS,
    visibleEdgeColor: 0x00e5ff,
  },
  inactive: {
    ...BASE_OUTLINE_SETTINGS,
    visibleEdgeColor: 0xc8b6ff,
  },
  toy: {
    ...BASE_OUTLINE_SETTINGS,
    visibleEdgeColor: 0x9ca3af,
  },
};
