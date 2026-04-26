import { useFrame } from "@react-three/fiber";
import { EffectComposerContext } from "@react-three/postprocessing";
import { BlendFunction, KernelSize, Pass } from "postprocessing";
import { useContext, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";

const FADE_SECONDS = 0.12;

export interface OutlineSettings {
  enabled?: boolean;
  blur?: boolean;
  xRay?: boolean;
  edgeStrength?: number;
  edgeThickness?: number;
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
  edgeStrength: 8.0,
  edgeThickness: 2.5,
  edgeGlow: 0.3,
  pulseSpeed: 0,
  visibleEdgeColor: 0xffffff,
  hiddenEdgeColor: 0x000000,
  width: undefined,
  height: undefined,
  kernelSize: KernelSize.SMALL,
  blendFunction: BlendFunction.ALPHA,
  patternTexture: undefined,
};

class ThreeOutlinePassAdapter extends Pass {
  readonly outlinePass: OutlinePass;

  constructor(
    resolution: THREE.Vector2,
    scene: THREE.Scene,
    camera: THREE.Camera,
    selectedObjects: THREE.Object3D[],
  ) {
    super("ThreeOutlinePassAdapter");
    this.needsSwap = false;
    this.outlinePass = new OutlinePass(
      resolution,
      scene,
      camera,
      selectedObjects,
    );
  }

  override set mainScene(scene: THREE.Scene) {
    this.outlinePass.renderScene = scene;
  }

  override set mainCamera(camera: THREE.Camera) {
    this.outlinePass.renderCamera = camera;
  }

  applySettings(settings: RequiredOutlineSettings) {
    const pass = this.outlinePass;
    pass.enabled = settings.enabled;
    pass.edgeStrength = settings.edgeStrength;
    pass.edgeThickness = settings.edgeThickness;
    pass.edgeGlow = settings.edgeGlow;
    pass.pulsePeriod = settings.pulseSpeed > 0 ? 1 / settings.pulseSpeed : 0;
    pass.visibleEdgeColor.setHex(settings.visibleEdgeColor);
    pass.hiddenEdgeColor.setHex(
      settings.xRay ? settings.hiddenEdgeColor : 0x000000,
    );
    pass.patternTexture = settings.patternTexture as THREE.Texture;
    pass.usePatternTexture = Boolean(settings.patternTexture);
  }

  setSelection(selectedObjects: THREE.Object3D[]) {
    this.outlinePass.selectedObjects = selectedObjects;
  }

  override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean,
  ) {
    this.outlinePass.renderToScreen = this.renderToScreen;
    this.outlinePass.render(
      renderer,
      outputBuffer,
      inputBuffer,
      deltaTime ?? 0,
      stencilTest ?? false,
    );
  }

  override setSize(width: number, height: number) {
    this.outlinePass.setSize(width, height);
  }

  override initialize() {
    // Three's OutlinePass allocates its targets in the constructor and resizes
    // through setSize; the postprocessing composer still expects this method.
  }

  override dispose() {
    this.outlinePass.dispose();
  }
}

type RequiredOutlineSettings = Required<
  Omit<OutlineSettings, "kernelSize" | "blendFunction" | "patternTexture">
> & {
  patternTexture?: THREE.Texture;
};

function resolveSettings(settings?: OutlineSettings): RequiredOutlineSettings {
  return {
    ...DEFAULT_OUTLINE_SETTINGS,
    ...settings,
  } as RequiredOutlineSettings;
}

export default function OutlineController({
  selectedObjects,
  settings,
}: {
  selectedObjects: THREE.Object3D[];
  settings?: OutlineSettings;
}) {
  const { scene, camera } = useContext(EffectComposerContext);
  const resolvedSettings = resolveSettings(settings);
  const targetEdgeStrength = resolvedSettings.edgeStrength;

  const pass = useMemo(
    () =>
      new ThreeOutlinePassAdapter(
        new THREE.Vector2(
          resolvedSettings.width ?? 1,
          resolvedSettings.height ?? 1,
        ),
        scene as THREE.Scene,
        camera,
        [],
      ),
    [camera, scene],
  );

  const fadeRef = useRef({
    current: 0,
    target: 0,
    held: [] as THREE.Object3D[],
  });

  useEffect(() => {
    pass.applySettings({ ...resolvedSettings, edgeStrength: fadeRef.current.current });
  }, [pass, resolvedSettings]);

  useEffect(() => {
    if (selectedObjects.length > 0) {
      fadeRef.current.held = selectedObjects;
      fadeRef.current.target = targetEdgeStrength;
      pass.setSelection(selectedObjects);
    } else {
      fadeRef.current.target = 0;
    }
  }, [pass, selectedObjects, targetEdgeStrength]);

  useFrame((_, delta) => {
    const f = fadeRef.current;
    if (f.current === f.target) return;
    const step = delta / FADE_SECONDS;
    if (f.current < f.target) {
      f.current = Math.min(f.target, f.current + step * targetEdgeStrength);
    } else {
      f.current = Math.max(f.target, f.current - step * targetEdgeStrength);
    }
    pass.outlinePass.edgeStrength = f.current;
    if (f.current === 0 && f.target === 0 && f.held.length > 0) {
      f.held = [];
      pass.setSelection([]);
    }
  });

  if (!resolvedSettings.enabled) return null;

  return <primitive object={pass} />;
}
