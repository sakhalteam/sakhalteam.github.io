// Whirlpool.tsx

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uFunnelRadius;
  uniform float uFunnelDepth;
  uniform float uDiscRadius;

  void main() {
    vUv = uv;
    vec3 p = position;
    // Disc is rotated -π/2 on X (same as water), so local +Z becomes world +Y.
    // Subtracting z here pushes the disc DOWN in world space to match the water crater.
    float d = length(p.xy);
    float funnel = smoothstep(uFunnelRadius, 0.0, d);
    p.z -= funnel * funnel * uFunnelDepth;
    // Clamp displacement to 0 outside the visible disc so the rim stays flat at water level
    if (d > uDiscRadius) p.z = position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;

  uniform float uTime;
  uniform float uSpinSpeed;
  uniform float uArms;
  uniform float uTwist;
  uniform vec3 uFoamColor;
  uniform vec3 uMidColor;
  uniform vec3 uDeepColor;
  uniform vec3 uPitColor;
  uniform vec3 uEdgeColor;

  void main() {
    // Recenter UVs to [-0.5, 0.5] with origin at disc center
    vec2 p = vUv - 0.5;
    float r = length(p);

    // Discard outside the disc (circular, not square)
    if (r > 0.5) discard;

    float a = atan(p.y, p.x);

    // Spiral: angle bands warped by log(r) so they curve inward
    float phase = a * uArms + log(r + 0.02) * uTwist - uTime * uSpinSpeed;
    float bands = 0.5 + 0.5 * sin(phase);
    // Sharpen the foam crests
    float foam = smoothstep(0.55, 0.95, bands);

    // Secondary faster ripple for detail
    float ripple = 0.5 + 0.5 * sin(phase * 2.0 + uTime * 1.5);
    ripple = smoothstep(0.7, 1.0, ripple) * 0.35;

    // Radial depth gradient: deep at center, foamy mid-ring, fade at edge
    float midRing = smoothstep(0.12, 0.35, r) * (1.0 - smoothstep(0.35, 0.5, r));
    float pit = smoothstep(0.14, 0.02, r);

    // Base color: deep -> mid based on radius
    vec3 color = mix(uDeepColor, uMidColor, smoothstep(0.05, 0.4, r));
    // Layer foam crests (stronger in mid-ring)
    color = mix(color, uFoamColor, foam * midRing + ripple * midRing * 0.6);
    // Dark pit at center
    color = mix(color, uPitColor, pit);

    // Blend disc color toward the surrounding water color in the outer ring
    // so the edge fades into the water hue before fading to transparent.
    float edgeBlend = smoothstep(0.28, 0.5, r);
    color = mix(color, uEdgeColor, edgeBlend);

    // Soft outer alpha fade (no hard circle boundary)
    float outerFade = smoothstep(0.5, 0.36, r);
    float alpha = outerFade;

    gl_FragColor = vec4(color, alpha);
  }
`;

interface WhirlpoolProps {
  /** World position of the whirlpool center (used when orbitEnabled is false) */
  position?: [number, number, number];
  /** Disc radius in world units */
  size?: number;
  /** Rotation speed of the spiral (higher = faster swirl) */
  spinSpeed?: number;
  /** Number of spiral arms */
  arms?: number;
  /** How tightly the spiral curves inward (higher = tighter) */
  twist?: number;
  /** If true, orbit around the island origin instead of staying at `position` */
  orbitEnabled?: boolean;
  /** Orbit radius in world units (distance from island center) */
  orbitRadius?: number;
  /** Orbit angular speed in rad/s (positive = CCW from above) */
  orbitSpeed?: number;
  /** Starting orbit angle in radians */
  orbitPhase?: number;
  /** Y height used while orbiting */
  orbitY?: number;
  /** Ref that receives the whirlpool's world position each frame (consumed by Water for the funnel) */
  centerRef?: React.RefObject<THREE.Vector3>;
  /** Radius of the water funnel (should match or slightly exceed disc size) */
  funnelRadius?: number;
  /** Depth of the funnel displacement applied to the disc */
  funnelDepth?: number;
}

/**
 * Stylized whirlpool: flat disc with a procedural spiral shader.
 * Sits just above the water plane. Purely visual — no click/portal wiring yet.
 */
export default function Whirlpool({
  position = [15, 0.08, 0],
  size = 2.2,
  spinSpeed = 1.6,
  arms = 5,
  twist = 8,
  orbitEnabled = true,
  orbitRadius = 13.5,
  orbitSpeed = 0.08,
  orbitPhase = 0,
  orbitY = 0.08,
  centerRef,
  funnelRadius = 2.8,
  funnelDepth = 1,
}: WhirlpoolProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSpinSpeed: { value: spinSpeed },
        uArms: { value: arms },
        uTwist: { value: twist },
        uFoamColor: { value: new THREE.Color("#e8fcff") },
        uMidColor: { value: new THREE.Color("#0877a7") },
        uDeepColor: { value: new THREE.Color("#352d7f") },
        uPitColor: { value: new THREE.Color("#123d6b") },
        uEdgeColor: { value: new THREE.Color("#0b6fb8") },
        uFunnelRadius: { value: funnelRadius },
        uFunnelDepth: { value: funnelDepth },
        uDiscRadius: { value: size },
      },
    });
  }, [spinSpeed, arms, twist, funnelRadius, funnelDepth, size]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = t;
    }
    if (orbitEnabled && groupRef.current) {
      const theta = t * orbitSpeed + orbitPhase;
      groupRef.current.position.x = Math.cos(theta) * orbitRadius;
      groupRef.current.position.z = Math.sin(theta) * orbitRadius;
      groupRef.current.position.y = orbitY;
    }
    if (centerRef?.current && groupRef.current) {
      centerRef.current.copy(groupRef.current.position);
    }
  });

  const initialPosition: [number, number, number] = orbitEnabled
    ? [
        Math.cos(orbitPhase) * orbitRadius,
        orbitY,
        Math.sin(orbitPhase) * orbitRadius,
      ]
    : position;

  // Plane is 2*size so the disc (radius=size) fits with a square bounding box;
  // fragment shader discards r > 0.5 in UV space to preserve the circular shape.
  // Needs segments for vertex displacement (CircleGeometry has no interior verts).
  const planeSize = size * 2;

  return (
    <group ref={groupRef} position={initialPosition}>
      <mesh rotation-x={-Math.PI / 2} renderOrder={0}>
        <planeGeometry args={[planeSize, planeSize, 64, 64]} />
        <primitive object={material} ref={matRef} attach="material" />
      </mesh>
    </group>
  );
}
