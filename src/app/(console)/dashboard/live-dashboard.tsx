"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardData, MinuteBucket } from "@/lib/dashboard";
import { RiskBadge, StatusTag, railClass } from "@/components/ui";

const SLOTS = 60;

export function LiveDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = initial.refresh_ms;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/dashboard", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const next = (await res.json()) as DashboardData;
          if (!stopped) {
            setData(next);
            setError(false);
            delay = next.refresh_ms;
          }
        } catch {
          if (!stopped) setError(true);
        }
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [initial.refresh_ms]);

  const t = data.totals;
  return (
    <div className="stack">
      <div className="toolbar">
        <span className={`live ${error ? "down" : ""}`} role="status">
          <i />
          {error ? "Connection lost, retrying" : `Live, updated ${new Date(data.generated_at).toLocaleTimeString()}`}
        </span>
      </div>

      <div className="metrics">
        <Metric label="Actions, last hour" value={t.events_1h} />
        <Metric label="High risk" value={t.risky_1h} tone={t.risky_1h ? "warn" : undefined} />
        <Metric label="Denied" value={t.denied_1h} tone={t.denied_1h ? "bad" : undefined} />
        <Metric label="Waiting for approval" value={t.pending_now} tone={t.pending_now ? "tripped" : undefined} href="/approvals" />
        <Metric label="Average risk" value={t.avg_risk_1h === null ? "–" : t.avg_risk_1h.toFixed(2)} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Risk trace</h2>
          <span className="meta">peak risk per minute, hold line at {data.threshold.toFixed(2)}</span>
        </div>
        <div className="panel-body">
          <RiskTrace buckets={data.per_minute} now={data.generated_at} threshold={data.threshold} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Volume</h2>
          <span className="meta">actions per minute, last 60 min</span>
        </div>
        <div className="panel-body">
          <VolumeChart buckets={data.per_minute} now={data.generated_at} />
          <div className="legend">
            <span><i style={{ background: "#8fa597" }} />Normal</span>
            <span><i style={{ background: "var(--orange)" }} />High risk</span>
            <span><i style={{ background: "var(--crit)" }} />Minute with a denial</span>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>By agent</h2><span className="meta">1h</span></div>
          <div className="panel-body">
            <Bars rows={data.by_agent.map((a) => ({ label: a.agent_name ?? a.agent_id, value: a.events, extra: `${a.risky} high risk` }))} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>By action type</h2><span className="meta">24h</span></div>
          <div className="panel-body">
            <Bars rows={data.by_action.map((a) => ({ label: a.action_type, value: a.events, extra: a.avg_risk === null ? "" : `risk ${a.avg_risk.toFixed(2)}` }))} />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Event stream</h2><span className="meta">latest {data.feed.length}</span></div>
        {data.feed.length === 0 ? (
          <p className="empty">No agent activity yet. Run an agent, or use <code>npm run simulate</code>.</p>
        ) : (
          <ul className="log">
            {data.feed.map((e) => (
              <li key={e.id}>
                <Link href={`/incidents/${e.id}`} className={`row ${railClass(e.risk_level)}`}>
                  <span className="time">{new Date(e.time).toLocaleTimeString()}</span>
                  <RiskBadge level={e.risk_level} />
                  <span className="act">{e.action_type}</span>
                  {e.target && <span className="tgt">{e.target}</span>}
                  <span className="who">{e.agent_name ?? e.agent_id}</span>
                  <span className="end"><StatusTag status={e.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, tone, href }: { label: string; value: number | string; tone?: "warn" | "bad" | "tripped"; href?: string }) {
  const body = (
    <>
      <div className="v">{value}</div>
      <div className="k">{label}</div>
    </>
  );
  return href ? <Link href={href} className={`metric ${tone ?? ""}`}>{body}</Link> : <div className={`metric ${tone ?? ""}`}>{body}</div>;
}

function slotsFor(buckets: MinuteBucket[], now: string): (MinuteBucket | null)[] {
  const end = Math.floor(new Date(now).getTime() / 60000) * 60000;
  const byMinute = new Map(buckets.map((b) => [new Date(b.bucket).getTime(), b]));
  return Array.from({ length: SLOTS }, (_, i) => byMinute.get(end - (SLOTS - 1 - i) * 60000) ?? null);
}

const W = 720;
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

/** Peak risk per minute against the line where Tripwire holds an action for approval. */
function RiskTrace({ buckets, now, threshold }: { buckets: MinuteBucket[]; now: string; threshold: number }) {
  const H = 100;
  const series = slotsFor(buckets, now);
  const x = (i: number) => (i + 0.5) * (W / SLOTS);
  const y = (v: number) => H - v * H;
  const pts = series.map((b, i) => (b && b.max_risk !== null ? { i, v: b.max_risk } : null)).filter((p): p is { i: number; v: number } => p !== null);
  return (
    <>
      <div className="plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Peak risk per minute over the last hour. Actions at or above ${threshold.toFixed(2)} are held.`}>
          <line className="limit" x1={0} x2={W} y1={y(threshold)} y2={y(threshold)} vectorEffect="non-scaling-stroke" />
          {pts.length > 1 && <polyline className="trace" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} vectorEffect="non-scaling-stroke" />}
          {pts.map((p) => (
            <path key={p.i} className={`dot ${p.v >= threshold ? "over" : ""}`} d={`M${x(p.i)} ${y(p.v)}h0.01`} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <span className="plot-label" style={{ top: pct(y(threshold), H) }}>Tripwire {threshold.toFixed(2)}</span>
      </div>
      <div className="plot-axis" aria-hidden="true"><span>60 min ago</span><span>Now</span></div>
    </>
  );
}

function VolumeChart({ buckets, now }: { buckets: MinuteBucket[]; now: string }) {
  const H = 100;
  const series = slotsFor(buckets, now);
  const max = Math.max(1, ...series.map((b) => b?.events ?? 0));
  const bw = W / SLOTS;
  const top = H - 8;
  return (
    <>
      <div className="plot short">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Actions per minute over the last hour, peak ${max} per minute`}>
          {series.map((b, i) => {
            if (!b) return null;
            const total = (b.events / max) * top;
            const risky = (b.risky / max) * top;
            return (
              <g key={i}>
                <rect className="safe" x={i * bw + 1.5} y={top - total} width={bw - 3} height={total - risky} />
                <rect className="risky" x={i * bw + 1.5} y={top - risky} width={bw - 3} height={risky} />
                {b.denied > 0 && <rect className="denied" x={i * bw + 1.5} y={top + 3} width={bw - 3} height={5} />}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="plot-axis" aria-hidden="true"><span>60 min ago</span><span>Now, peak {max} per minute</span></div>
    </>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; extra: string }[] }) {
  if (rows.length === 0) return <p className="loading" style={{ margin: 0 }}>No data yet.</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="bar-top">
            <code>{r.label}</code>
            <span>{r.value}{r.extra && `, ${r.extra}`}</span>
          </div>
          <div className="bar"><div style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
