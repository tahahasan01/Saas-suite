"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { LazyCanvas } from "./three/LazyCanvas";

/* The unification core: one OS at the centre, three modules orbiting it, each
   wired back to the core. The spoke lives inside the orbiting group, so it stays
   attached without rebuilding geometry every frame. */

// Radii are sized against the camera frustum below — at fov 40 / z 10 the visible
// half-height is ~3.6, so 2.9 is the largest orbit that stays fully on canvas.
const MODULES = [
  { radius: 1.9, speed: 0.34, tilt: 0.32, phase: 0, color: "#818cf8" },
  { radius: 2.4, speed: -0.24, tilt: -0.45, phase: 2.1, color: "#38bdf8" },
  { radius: 2.9, speed: 0.18, tilt: 0.62, phase: 4.2, color: "#c084fc" },
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

/** A packet of data running the spoke from a module into the core — the one
 *  thing three separate apps cannot do, made literal. */
function Packet({ radius, color, offset }: { radius: number; color: string; offset: number }) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime * 0.45 + offset) % 1;
    ref.current.position.x = radius * (1 - t); // module → core
    (ref.current.material as { opacity: number }).opacity = Math.sin(t * Math.PI);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.065, 12, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent />
    </mesh>
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
        <Packet radius={radius} color={color} offset={0} />
        <Packet radius={radius} color={color} offset={0.5} />
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
    // Decorative: the headline beside it carries the meaning.
    <LazyCanvas className="absolute inset-0" camera={{ position: [0, 1.6, 10], fov: 40 }}>
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={70} color="#818cf8" />
      <pointLight position={[-5, -2, -3]} intensity={40} color="#38bdf8" />
      <Parallax>
        <Core />
        {MODULES.map((m) => (
          <Module key={m.phase} {...m} />
        ))}
      </Parallax>
    </LazyCanvas>
  );
}
