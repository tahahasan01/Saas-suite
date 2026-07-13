"use client";

// Catches errors in the root layout itself — must render its own <html>/<body>.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#08090d", color: "#e8eaf0", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem", textAlign: "center" }}>
          <div>
            <p style={{ fontSize: "2rem" }}>⚠️</p>
            <h1 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Application error</h1>
            <p style={{ color: "#9aa1b2", fontSize: "0.875rem", margin: "0.5rem 0 1rem" }}>Please reload the page.</p>
            <button onClick={reset} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}>
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
