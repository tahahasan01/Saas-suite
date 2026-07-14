"use client";

import { useEffect, useState } from "react";

// Each word must be a label the app actually renders — these are the seeded
// `lead` terms from seed.py, one per industry: retail, education, pharmacy,
// wholesale + real_estate, restaurant, b2b_software. "Investors" used to sit in
// this list; no industry maps a lead to one, so the headline promised a
// vocabulary the product doesn't have.
const WORDS = ["Customers", "Students", "Patients", "Buyers", "Guests", "Clients"];

// The word is the hero's focal point, so the blank moment between words has to
// be as short as legibility allows: a 300ms fade on a 2.2s cycle left the
// headline visibly empty a quarter of the time.
const HOLD = 2600;
const FADE = 150;

export function RotatingWord() {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setI((v) => (v + 1) % WORDS.length);
        setShow(true);
      }, FADE);
    }, HOLD);
    return () => clearInterval(id);
  }, []);

  // Solid ink rather than a bg-clip gradient: `color: transparent` would leave
  // the glyphs unpainted behind the hero's glow. The colour lives in the glow.
  return (
    <span
      className={`inline-block transition-all ease-out ${show ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
      style={{ transitionDuration: `${FADE}ms` }}
    >
      {WORDS[i]}
    </span>
  );
}
