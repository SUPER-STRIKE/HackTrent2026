"use client";

import { useEffect, useState } from "react";
import type { DashboardData, MinuteBucket } from "@/lib/dashboard";

const POLL_MS = 3000;

const LEVEL_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_STYLE: Record<string, string> = {
  allowed: "text-gray-500",
  pending: "text-amber-700",
  approved: "text-emerald-700",
  denied: "text-red-700",
};

export function LiveDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as DashboardData;
        if (!stopped) {
          setData(next);
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      }
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const t = data.totals;
  return (
    <div className="flex flex-col gap-6">
      <p className={`text-xs ${error ? "text-red-600" : "text-gray-400"}`}>
        {error ? "Connection lost, retrying…" : `Live · updated ${new Date(data.generated_at).toLocaleTimeString()}`}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Actions (1h)" value={t.events_1h} />
        <Stat label="Risky (1h)" value={t.risky_1h} tone={t.risky_1h ? "warn" : undefined} />
        <Stat label="Denied (1h)" value={t.denied_1h} tone={t.denied_1h ? "bad" : undefined} />
        <Stat label="Pending now" value={t.pending_now} tone={t.pending_now ? "warn" : undefined} href="/approvals" />
        <Stat label="Avg risk (1h)" value={t.avg_risk_1h === null ? "–" : t.avg_risk_1h.toFixed(2)} />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Actions per minute (last hour)</h2>
        <MinuteChart buckets={data.per_minute} now={data.generated_at} />
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-semibold">By agent (1h)</h2>
          <Bars rows={data.by_agent.map((a) => ({ label: a.agent_name ?? a.agent_id, value: a.events, extra: `${a.risky} risky` }))} />
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">By action type (24h)</h2>
          <Bars rows={data.by_action.map((a) => ({ label: a.action_type, value: a.events, extra: a.avg_risk === null ? "" : `risk ${a.avg_risk.toFixed(2)}` }))} />
        </section>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Live feed</h2>
        {data.feed.length === 0 ? (
          <p className="rounded border border-dashed px-4 py-6 text-center text-gray-500">No agent activity yet.</p>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {data.feed.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="w-16 shrink-0 text-xs text-gray-400">{new Date(e.time).toLocaleTimeString()}</span>
                {e.risk_level ? (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${LEVEL_STYLE[e.risk_level] ?? ""}`}>{e.risk_level}</span>
                ) : (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">unscored</span>
                )}
                <code className="break-all font-semibold">{e.action_type}</code>
                {e.target && <code className="break-all text-gray-500">→ {e.target}</code>}
                <span className="text-xs text-gray-400">{e.agent_name ?? e.agent_id}</span>
                <span className={`ml-auto text-xs font-semibold ${STATUS_STYLE[e.status] ?? ""}`}>{e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: number | string; tone?: "warn" | "bad"; href?: string }) {
  const color = tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "";
  const body = (
    <>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </>
  );
  const cls = "rounded border p-3";
  return href ? (
    <a href={href} className={`${cls} hover:bg-gray-50`}>{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Stacked bars: safe (grey) + risky (orange) per minute. Plain SVG, no chart dependency. */
function MinuteChart({ buckets, now }: { buckets: MinuteBucket[]; now: string }) {
  const W = 720;
  const H = 140;
  const slots = 60;
  const end = Math.floor(new Date(now).getTime() / 60000) * 60000;
  const byMinute = new Map(buckets.map((b) => [new Date(b.bucket).getTime(), b]));
  const series = Array.from({ length: slots }, (_, i) => byMinute.get(end - (slots - 1 - i) * 60000) ?? null);
  const max = Math.max(1, ...series.map((b) => b?.events ?? 0));
  const bw = W / slots;

  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full rounded border bg-white" role="img" aria-label="Actions per minute over the last hour">
      {series.map((b, i) => {
        if (!b) return null;
        const total = (b.events / max) * H;
        const risky = (b.risky / max) * H;
        return (
          <g key={i}>
            <rect x={i * bw + 1} y={H - total} width={bw - 2} height={total - risky} fill="#9ca3af" />
            <rect x={i * bw + 1} y={H - risky} width={bw - 2} height={risky} fill="#f97316" />
            {b.denied > 0 && <rect x={i * bw + 1} y={H + 2} width={bw - 2} height={4} fill="#dc2626" />}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={H} y2={H} stroke="#d1d5db" />
      <text x={2} y={H + 14} fontSize={9} fill="#6b7280">-60m</text>
      <text x={W - 2} y={H + 14} fontSize={9} fill="#6b7280" textAnchor="end">now · peak {max}/min · grey safe, orange risky, red denied</text>
    </svg>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; extra: string }[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">No data yet.</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2">
            <code className="truncate">{r.label}</code>
            <span className="shrink-0 text-gray-500">{r.value}{r.extra && ` · ${r.extra}`}</span>
          </div>
          <div className="mt-0.5 h-2 rounded bg-gray-100">
            <div className="h-2 rounded bg-black" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
