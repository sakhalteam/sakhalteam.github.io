// Waterfall.tsx
//
// Scene-scans for a group named `swimming_pool_waterfall` and replaces its
// children's materials. The group is expected to have up to 3 sub-meshes:
//   - curtain (middle, biggest) — gets the scrolling sine-band water shader
//   - bottom (lowest) — gets a foam shader: undulating white spikes at the
//     top fading to transparent at the bottom (dissolves the sharp rectangular
//     edge of the Blender plane into a soft splash)
//   - top (highest) — same shader as curtain for now
//
// Classification is by mesh-center world-Y within the group's world bbox.

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vYNorm;
  uniform float uWorldMinY;
  uniform float uWorldMaxY;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    float range = max(uWorldMaxY - uWorldMinY, 0.0001);
    vYNorm = clamp((uWorldMaxY - worldPos.y) / range, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const noiseFns = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;

const curtainFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vYNorm;
  uniform float uTime;
  uniform vec3 uColorBase;
  uniform vec3 uColorLight;
  uniform vec3 uColorFoam;
  uniform float uScrollSpeed;
  uniform float uBandFrequency;
  uniform float uBandWobble;

  ${noiseFns}

  void main() {
    float y = vYNorm;

    // Scrolling sine-curtain: light-blue crest + thin white highlight over
    // a dark-blue base. fract() = periodic 0..1 ramp, shaped by smoothstep.
    float phase = y * uBandFrequency - uTime * uScrollSpeed;
    phase += sin(vUv.x * 6.2832) * uBandWobble;
    float wave = fract(phase);

    vec3 col = uColorBase;
    float crest = smoothstep(0.18, 0.48, wave) * smoothstep(0.88, 0.55, wave);
    col = mix(col, uColorLight, crest);
    float highlight = smoothstep(0.44, 0.50, wave) * smoothstep(0.58, 0.50, wave);
    col = mix(col, uColorFoam, highlight * 0.85);

    // Top-impact foam (the "mouth" where water pours in from the pool).
    float topFoam = smoothstep(0.14, 0.0, y);
    col = mix(col, uColorFoam, topFoam);

    gl_FragColor = vec4(col, 0.95);
  }
`;

const foamFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vYNorm;
  uniform float uTime;
  uniform vec3 uColorFoam;
  uniform float uFlip; // 0 = spikes root at top edge, 1 = spikes root at bottom edge
  uniform float uScrollSpeed;

  ${noiseFns}

  void main() {
    float y = vYNorm;
    // dir: 0 at the "root" of the spikes, 1 at their "tips".
    float dir = mix(y, 1.0 - y, uFlip);

    // Aurora-style vertical spikes: each X column has its own reach driven
    // by three noise layers at increasing X-frequencies. That gives a mix of
    // broad waves + fine individual spikes, all dancing at different rates.
    float t = uTime * uScrollSpeed;
    float s1 = noise(vec2(vUv.x * 8.0, t * 0.5));
    float s2 = noise(vec2(vUv.x * 24.0 + 5.0, t * 0.9));
    float s3 = noise(vec2(vUv.x * 60.0 + 11.0, t * 1.4));
    float spike = (s1 * 0.55 + s2 * 0.30 + s3 * 0.15);

    // Reach: each column's spike grows this far from the root edge.
    float reach = mix(0.15, 0.95, spike);

    // Tight smoothstep = sharp spike edges (cel look). Widen the second arg
    // to soften them into wispier flames.
    float mask = smoothstep(reach, reach - 0.08, dir);

    // A tiny bit of secondary alpha flicker for shimmer.
    float flicker = 0.85 + 0.15 * noise(vec2(vUv.x * 30.0, t * 2.5));
    mask *= flicker;

    gl_FragColor = vec4(uColorFoam, mask);
  }
`;

const colorBase = new THREE.Color("#2068a0");
const colorLight = new THREE.Color("#6fc8e8");
const colorFoam = new THREE.Color("#f5fbff");

function makeCurtainMaterial(minY: number, maxY: number) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: curtainFragment,
    uniforms: {
      uTime: { value: 0 },
      uWorldMinY: { value: minY },
      uWorldMaxY: { value: maxY },
      uScrollSpeed: { value: 0.45 },
      uBandFrequency: { value: 3.5 },
      uBandWobble: { value: 0.06 },
      uColorBase: { value: colorBase },
      uColorLight: { value: colorLight },
      uColorFoam: { value: colorFoam },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeFoamMaterial(minY: number, maxY: number, flip: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: foamFragment,
    uniforms: {
      uTime: { value: 0 },
      uWorldMinY: { value: minY },
      uWorldMaxY: { value: maxY },
      uFlip: { value: flip ? 1.0 : 0.0 },
      uScrollSpeed: { value: 1.0 },
      uColorFoam: { value: colorFoam },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

type Role = "curtain" | "bottom" | "top";

export default function Waterfall({
  scene,
  meshName = "swimming_pool_waterfall",
}: {
  scene: THREE.Object3D;
  meshName?: string;
}) {
  const data = useMemo(() => {
    const target = meshName.toLowerCase();
    let root: THREE.Object3D | null = null;
    scene.traverse((o) => {
      if (!root && o.name.toLowerCase() === target) root = o;
    });
    if (!root) {
      console.warn(`[WTR] No node named "${meshName}" in scene.`);
      return null;
    }
    const meshes: THREE.Mesh[] = [];
    (root as THREE.Object3D).traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) meshes.push(m);
    });
    if (meshes.length === 0) {
      console.warn(`[WTR] Node "${meshName}" has no mesh descendants.`);
      return null;
    }
    (root as THREE.Object3D).updateWorldMatrix(true, true);
    const groupBox = new THREE.Box3().setFromObject(root as THREE.Object3D);

    // Classify by position-rank, not threshold — much more robust when the
    // meshes overlap vertically (as they do here: the bottom foam mesh is
    // centered 22% up the group, easy to miss with a strict cutoff).
    // With ≥3 meshes: lowest-center = bottom, highest-center = top, rest = curtain.
    // With 2 meshes: lowest-center = bottom, other = curtain.
    // With 1 mesh: curtain.
    const entries = meshes.map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      return {
        mesh,
        role: "curtain" as Role,
        minY: box.min.y,
        maxY: box.max.y,
        centerY: (box.min.y + box.max.y) / 2,
      };
    });
    if (entries.length >= 2) {
      const sorted = [...entries].sort((a, b) => a.centerY - b.centerY);
      sorted[0].role = "bottom";
      if (sorted.length >= 3) {
        sorted[sorted.length - 1].role = "top";
      }
    }
    const classified = entries;

    return {
      classified,
      groupMinY: groupBox.min.y,
      groupMaxY: groupBox.max.y,
    };
  }, [scene, meshName]);

  const materials = useMemo(() => {
    if (!data) return null;
    return data.classified.map((entry) => {
      if (entry.role === "bottom") {
        // flip=true → spike roots at bottom edge, tips reach upward toward
        // the curtain above (dancing aurora pointing at the splash point).
        return makeFoamMaterial(entry.minY, entry.maxY, true);
      }
      // curtain + top share one continuous band pattern via the group-wide bbox.
      return makeCurtainMaterial(data.groupMinY, data.groupMaxY);
    });
  }, [data]);

  useEffect(() => {
    if (!data || !materials) return;
    const prevs = data.classified.map((e) => e.mesh.material);
    data.classified.forEach((e, i) => {
      e.mesh.material = materials[i];
    });
    const summary = data.classified
      .map((e) => `${e.role}(y:${e.minY.toFixed(1)}→${e.maxY.toFixed(1)})`)
      .join(", ");
    console.log(`[WTR] ${data.classified.length} mesh(es): ${summary}`);
    return () => {
      data.classified.forEach((e, i) => {
        e.mesh.material = prevs[i];
      });
    };
  }, [data, materials]);

  useFrame((_, dt) => {
    if (!materials) return;
    for (const m of materials) {
      m.uniforms.uTime.value += dt;
    }
  });

  return null;
}
