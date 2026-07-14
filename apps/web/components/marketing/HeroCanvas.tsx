"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// three.js is heavy and touches window — keep it off the server and out of the
// initial bundle; the hero reads fine without it while it loads.
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

export function HeroCanvas() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Honour reduced-motion: the CSS atmosphere alone carries the hero.
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!enabled) return null;
  return <HeroScene />;
}
