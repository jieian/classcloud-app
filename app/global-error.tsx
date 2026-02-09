"use client";

/**
 * Global Error Boundary
 * Catches errors in root layout
 * Fallback for catastrophic failures
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ color: "#e03131", marginBottom: "1rem" }}>
            Application Error
          </h1>
          <p style={{ color: "#868e96", marginBottom: "2rem", textAlign: "center" }}>
            A critical error occurred. Please refresh the page or contact support if the problem persists.
          </p>

          {process.env.NODE_ENV === "development" && (
            <pre
              style={{
                padding: "1rem",
                backgroundColor: "#f8f9fa",
                borderRadius: "4px",
                color: "#e03131",
                fontSize: "0.875rem",
                maxWidth: "600px",
                overflow: "auto",
              }}
            >
              {error.message}
            </pre>
          )}

          <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#228be6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "transparent",
                color: "#228be6",
                border: "1px solid #228be6",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Go to Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
