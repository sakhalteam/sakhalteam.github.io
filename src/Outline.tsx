// Outline.tsx
//
// Restored to the 4/22 baseline (commit e11adb9). The April-26 fb0561a
// rewrite replaced drei's `<Outline>` (a lightweight postprocessing-pmndrs
// effect) with a custom adapter wrapping `THREE.OutlinePass` from
// three/examples/jsm. That pass runs full extra scene-depth render passes
// every frame even with zero selected objects, and was silently dimming
// the entire scene + tinting whites grey (water foam, island lighting).
// Reverted because the cross-fade animation isn't worth the rendering hit.
//
// `edgeThickness` and `edgeGlow` stay on the settings type so callers
// (outlineStyles.ts) don't break — they're ignored by drei's <Outline>.

import { Outline } from "@react-three/postprocessing";
import { KernelSize, BlendFunction } from "postprocessing";
import * as THREE from "three";

export interface OutlineSettings {
  enabled?: boolean;
  blur?: boolean;
  xRay?: boolean;
  edgeStrength?: number;
  /** Ignored — kept for API compat with the post-fb0561a adapter. */
  edgeThickness?: number;
  /** Ignored — kept for API compat with the post-fb0561a adapter. */
  edgeGlow?: number;
  pulseSpeed?: number;
  visibleEdgeColor?: number;
  hiddenEdgeColor?: number;
  width?: number;
  height?: number;
  kernelSize?: KernelSize;
  blendFunction?: BlendFunction;
  patternTexture?: THREE.Texture;
}

export const DEFAULT_OUTLINE_SETTINGS: OutlineSettings = {
  enabled: true,
  blur: false,
  xRay: false,
  edgeStrength: 2.0,
  pulseSpeed: 0,
  visibleEdgeColor: 0xffd76a,
  hiddenEdgeColor: 0x000000,
  width: undefined,
  height: undefined,
  kernelSize: KernelSize.SMALL,
  blendFunction: BlendFunction.ALPHA,
  patternTexture: undefined,
};

export default function OutlineController({
  selectedObjects,
  settings = DEFAULT_OUTLINE_SETTINGS,
}: {
  selectedObjects: THREE.Object3D[];
  settings?: OutlineSettings;
}) {
  if (!settings.enabled) return null;

  return (
    <Outline
      selection={selectedObjects}
      blendFunction={settings.blendFunction}
      patternTexture={settings.patternTexture}
      edgeStrength={settings.edgeStrength}
      pulseSpeed={settings.pulseSpeed}
      visibleEdgeColor={settings.visibleEdgeColor}
      hiddenEdgeColor={settings.hiddenEdgeColor}
      width={settings.width}
      height={settings.height}
      kernelSize={settings.kernelSize}
      blur={settings.blur}
      xRay={settings.xRay}
    />
  );
}
