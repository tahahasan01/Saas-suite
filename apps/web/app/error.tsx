"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="space-y-4 text-center">
        <p className="text-4xl">⚠️</p>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-xs text-sm text-fg-muted">
          An unexpected error occurred. You can try again — if it keeps happening, please let us know.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
