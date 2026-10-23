"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/** A box to sign in with a finger, pen or mouse (pointer events). Reports a
 *  PNG data URL after each stroke, or null once cleared. */
export function SignaturePad({ label, onChange }: { label: string; onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // Draw at the device's pixel density so the signature isn't blurry.
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#10201e";
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(canvas.current?.toDataURL("image/png") ?? null);
  }
  function clear() {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1">
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className="h-32 w-full touch-none rounded-md border border-line-strong bg-white"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      />
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>{empty ? "Sign in the box" : "Signed"}</span>
        <Button size="sm" variant="ghost" type="button" disabled={empty} onClick={clear}>Clear</Button>
      </div>
    </div>
  );
}
