"use client";

import { useEffect, useState } from "react";

const WORDS = ["Customers", "Students", "Patients", "Investors", "Guests", "Clients"];

export function RotatingWord() {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setI((v) => (v + 1) % WORDS.length);
        setShow(true);
      }, 260);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className={`inline-block bg-gradient-to-r from-brand to-[#a78bfa] bg-clip-text text-transparent transition-all duration-300 ${
        show ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
      }`}
    >
      {WORDS[i]}
    </span>
  );
}
