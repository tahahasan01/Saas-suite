"use client";

/** Looping band of capabilities. Two identical copies scroll as one track and
 *  the animation resets at the seam, so the loop never visibly jumps. */
export function Marquee({ items }: { items: string[] }) {
  return (
    <div
      className="relative overflow-hidden py-1"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)" }}
      aria-hidden
    >
      <ul className="animate-marquee flex w-max gap-3">
        {[...items, ...items].map((item, i) => (
          <li
            key={i}
            className="edge-lit shrink-0 rounded-full border border-line bg-surface/70 px-4 py-2 text-xs text-fg-muted"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
