"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { CanvasProps } from "@react-three/fiber";

/** A Canvas that mounts on first scroll-into-view and only renders while visible.
 *  Four always-on WebGL contexts would drain a laptop for scenes nobody is looking at. */
export function LazyCanvas({ children, className, ...props }: CanvasProps & { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className={className}>
      {seen && (
        <Canvas dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} frameloop={visible ? "always" : "never"} {...props}>
          {children}
        </Canvas>
      )}
    </div>
  );
}

/** True when the visitor asked for less motion — every scene checks this. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return reduced;
}
