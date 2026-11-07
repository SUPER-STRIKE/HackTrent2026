"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "model"; text: string };

const SUGGESTIONS = [
  "What happened in the last hour?",
  "Which actions were blocked and why?",
  "Which agent is the riskiest?",
];

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages;
    setMessages([...history, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    let reply: string;
    try {
      const res = await fetch("/api/investigator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      reply = res.ok && data.answer ? data.answer : `Error: ${data.error ?? res.status}`;
    } catch {
      reply = "Error: could not reach the server.";
    }
    setMessages((m) => [...m, { role: "model", text: reply }]);
    setBusy(false);
    queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-64 flex-col gap-3 rounded border p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-2 text-sm text-gray-500">
            <p>Ask about what your agents did. Try:</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => void send(s)} className="rounded border px-3 py-1 text-left text-gray-700 hover:bg-gray-50">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "self-end rounded bg-black px-3 py-2 text-sm text-white" : "self-start whitespace-pre-wrap rounded bg-gray-100 px-3 py-2 text-sm"}>
            {m.text}
          </div>
        ))}
        {busy && <p className="text-sm text-gray-400">Investigating…</p>}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ask the Investigator…"
          aria-label="Question"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button disabled={busy || !input.trim()} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  );
}
