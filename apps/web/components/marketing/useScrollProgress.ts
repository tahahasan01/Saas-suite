"use client";

import { useEffect, useRef, useState } from "react";

/** Progress (0→1) of an element through its own pinned range: 0 when its top
 *  reaches the top of the viewport, 1 when its bottom does. Everything the
 *  scroll-driven sections do is a function of this one number.
 *
 *  Reads are coalesced into a single rAF per frame — a fast wheel fires scroll
 *  far more often than the compositor paints, and measuring on every event is
 *  what makes this kind of section feel cheap. */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      // Shorter than the viewport means there is no range to scrub through.
      if (travel <= 0) return setProgress(0);
      setProgress(Math.min(1, Math.max(0, -r.top / travel)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    read(); // deep-link / refresh mid-section: start at the right offset
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { ref, progress };
}

/** Live `prefers-reduced-motion`. Starts false so SSR and first paint agree;
 *  the effect corrects it before anything has had time to move. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
