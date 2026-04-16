import { Outline } from "@react-three/postprocessing";
import { KernelSize, BlendFunction } from "postprocessing";
import * as THREE from "three";

export interface OutlineSettings {
  enabled?: boolean;
  blur?: boolean;
  xRay?: boolean;
  edgeStrength?: number;
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
