"use client";

export default function Error({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-gray-500">The page could not load. Your agents are not affected.</p>
      <button onClick={() => unstable_retry()} className="rounded bg-black px-4 py-2 text-white">
        Try again
      </button>
    </main>
  );
}
