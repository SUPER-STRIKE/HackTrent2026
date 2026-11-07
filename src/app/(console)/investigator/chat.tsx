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
    <section className="panel">
      <div className="panel-head">
        <h2>Audit log assistant</h2>
        <span className="meta">last 7 days, latest 120 events</span>
      </div>
      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-intro">
            <p>Ask a question, or start with one of these.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => void send(s)} className="chip">{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="who">{m.role === "user" ? "You" : "Investigator"}</span>
            {m.text}
          </div>
        ))}
        {busy && <p className="loading" style={{ margin: 0 }}>Investigating…</p>}
        <div ref={endRef} />
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Ask about agent activity" aria-label="Question" />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </section>
  );
}
