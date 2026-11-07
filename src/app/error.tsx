"use client";

export default function Error({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <div className="hero">
      <h1>This page failed to load</h1>
      <p>Your agents are not affected. Try again, and check the database connection if it keeps failing.</p>
      <button onClick={() => unstable_retry()} className="btn btn-primary">Try again</button>
    </div>
  );
}
