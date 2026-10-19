/** Score plus its tier in words; the colour only reinforces "hot/warm/cold",
 *  it never carries the meaning alone. `relative` keeps the sr-only text
 *  anchored to the pill, so it can't escape a scrolling table or board. */
export function ScorePill({ score }: { score: number }) {
  const tier = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  const cls = tier === "hot" ? "bg-success/15 text-success" : tier === "warm" ? "bg-warning/15 text-warning" : "bg-elevated text-fg-muted";
  return (
    <span
      className={`relative shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}
      title={`Lead score ${score} (${tier})`}
    >
      <span className="sr-only">Score </span>{score} · {tier}
    </span>
  );
}
