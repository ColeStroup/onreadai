"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <section style={{ maxWidth: 520, textAlign: "center" }}>
            <p style={{ fontWeight: 700 }}>Onread AI</p>
            <h1>We could not load the application</h1>
            <p>Please try again. Your saved account data has not been changed.</p>
            {error.digest ? <p>Reference: {error.digest}</p> : null}
            <button type="button" onClick={() => unstable_retry()}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
