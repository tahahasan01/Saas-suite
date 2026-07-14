"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Group, Mesh } from "three";

/* The unification core: one OS at the centre, three modules orbiting it, each
   wired back to the core. The spoke lives inside the orbiting group, so it stays
   attached without rebuilding geometry every frame. */

const MODULES = [
  { radius: 2.1, speed: 0.34, tilt: 0.32, phase: 0, color: "#818cf8" },
  { radius: 2.7, speed: -0.24, tilt: -0.45, phase: 2.1, color: "#38bdf8" },
  { radius: 3.2, speed: 0.18, tilt: 0.62, phase: 4.2, color: "#c084fc" },
];

function Core() {
  const wire = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!wire.current) return;
    wire.current.rotation.y += dt * 0.12;
    wire.current.rotation.x += dt * 0.05;
  });
  return (
    <group>
      <mesh ref={wire}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.62, 32, 32]} />
        <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={1.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Module({ radius, speed, tilt, phase, color }: (typeof MODULES)[number]) {
  const orbit = useRef<Group>(null);
  useFrame((_, dt) => {
    if (orbit.current) orbit.current.rotation.y += dt * speed;
  });
  const spoke = useMemo<[number, number, number][]>(() => [[0, 0, 0], [radius, 0, 0]], [radius]);

  return (
    <group rotation={[tilt, phase, 0]}>
      {/* Orbit path — recessive, it's context not subject. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.005, 8, 128]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0.18} />
      </mesh>
      <group ref={orbit}>
        <Line points={spoke} color={color} lineWidth={1} transparent opacity={0.22} />
        <mesh position={[radius, 0, 0]}>
          <sphereGeometry args={[0.17, 24, 24]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

/** Drifts the whole rig toward the cursor — depth cue, not a toy. */
function Parallax({ children }: { children: React.ReactNode }) {
  const rig = useRef<Group>(null);
  useFrame((state, dt) => {
    if (!rig.current) return;
    const damp = Math.min(1, dt * 2);
    rig.current.rotation.y += (state.pointer.x * 0.32 - rig.current.rotation.y) * damp;
    rig.current.rotation.x += (-state.pointer.y * 0.18 - rig.current.rotation.x) * damp;
  });
  return <group ref={rig}>{children}</group>;
}

export default function HeroScene() {
  return (
    <Canvas
      camera={{ position: [0, 1.2, 7], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      // Decorative: the headline beside it carries the meaning.
      aria-hidden
      className="!absolute inset-0"
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={70} color="#818cf8" />
      <pointLight position={[-5, -2, -3]} intensity={40} color="#38bdf8" />
      <Parallax>
        <Core />
        {MODULES.map((m) => (
          <Module key={m.phase} {...m} />
        ))}
      </Parallax>
    </Canvas>
  );
}
