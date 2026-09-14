"use client";

// Catches errors thrown anywhere in the root layout (including the app
// shell / wage bar, which live outside any page-level error.tsx boundary).
// Must render its own <html>/<body> since it replaces the entire document.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="da">
      <body style={{ margin: 0, background: "#0b0d12", color: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "2rem" }}>⚠️</p>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Noget gik galt</h1>
          <p style={{ color: "#9ca3af", margin: 0, maxWidth: "24rem" }}>
            Appen stødte på en fejl og kunne ikke vise siden. Prøv igen — dine data er ikke påvirket.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "0.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.75rem",
              background: "#f59e0b",
              color: "#0b0d12",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Prøv igen
          </button>
        </div>
      </body>
    </html>
  );
}
