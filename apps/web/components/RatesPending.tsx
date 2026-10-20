/**
 * Shown while the tax table behind a payroll figure is still `verified=false`
 * (St03 §7, D-10): the slabs come from published summaries of the Finance Act
 * and haven't been checked against the Gazette, so tax is an estimate.
 */
export function RatesPendingBanner({ taxYear }: { taxYear?: string }) {
  return (
    <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <p className="font-medium text-warning">Tax rates pending verification</p>
      <p className="mt-0.5 text-fg-muted">
        Income tax{taxYear ? ` for ${taxYear}` : ""} uses slab rates that haven&apos;t yet been checked
        against the official Finance Act Gazette. Treat the tax figures as estimates until they are.
      </p>
    </div>
  );
}
