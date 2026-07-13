import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="space-y-3 text-center">
        <p className="text-6xl font-bold text-fg-subtle">404</p>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-fg-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link href="/" className="inline-block text-sm text-brand hover:underline">← Back home</Link>
      </div>
    </main>
  );
}
