"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import data from "@/data/tech-disasters.json";

export type Category = "cli" | "code" | "config";

export type Disaster = {
  id: "knight-capital" | "gitlab-db1" | "hawaii-alert";
  year: number;
  title: string;
  /** Name used on the tab. */
  short: string;
  category: Category;
  impact: { value: string; label: string };
  /** The command that was actually run, when it is on record. */
  command?: string;
  cause: string;
  guardrail: string;
  /** Link to an official post-mortem or report. */
  source?: string;
};

const STORIES = data as Disaster[];

type Mode = "real" | "guarded";

/**
 * Three incidents replayed as small animated scenes. Each can be played as it happened,
 * or with the guardrail that would have stopped it. Scenes are CSS keyframes, restarted by
 * remounting them with a new key; the Knight Capital counter is the only JS-driven part.
 */
export function Disasters() {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("real");
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Start the first replay when the stage scrolls into view.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      const id = requestAnimationFrame(() => setPlaying(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const story = STORIES[active];
  const restart = () => {
    setPlaying(true);
    setRun((r) => r + 1);
  };
  const pick = (i: number) => {
    setActive(i);
    setMode("real");
    restart();
  };
  const choose = (m: Mode) => {
    setMode(m);
    restart();
  };

  // Arrow keys move between tabs, as in any tab list.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = STORIES.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    pick(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="replays" aria-labelledby="replays-title">
      <div className="replays-head">
        <h2 id="replays-title">One action was enough</h2>
        <p>Three real incidents where a single command, deploy or menu choice went straight through. Replay each one, then replay it with the check that would have stopped it.</p>
      </div>

      <div className="replay-tabs" role="tablist" aria-label="Incidents">
        {STORIES.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            type="button"
            id={`tab-${s.id}`}
            aria-selected={i === active}
            aria-controls="replay-panel"
            tabIndex={i === active ? 0 : -1}
            className="replay-tab"
            onClick={() => pick(i)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <span className="tab-year">{s.year}</span>
            <span className="tab-name">{s.short}</span>
            <span className="tab-impact">{s.impact.value}</span>
          </button>
        ))}
      </div>

      <div className="replay" id="replay-panel" role="tabpanel" aria-labelledby={`tab-${story.id}`}>
        <div className="replay-stage-wrap">
          <div ref={stageRef} className={`stage mode-${mode}`}>
            <Scene key={`${story.id}-${mode}-${run}`} id={story.id} mode={mode} playing={playing} />
          </div>
          <div className="replay-controls">
            <div className="mode-switch" role="group" aria-label="Replay mode">
              <button type="button" aria-pressed={mode === "real"} onClick={() => choose("real")}>What happened</button>
              <button type="button" aria-pressed={mode === "guarded"} onClick={() => choose("guarded")}>With a guardrail</button>
            </div>
            <button type="button" className="btn btn-sm replay-btn" onClick={restart}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3" />
              </svg>
              Replay
            </button>
          </div>
        </div>

        <div className="replay-text">
          <h3>{story.title}</h3>
          <p className="impact">
            <strong>{story.impact.value}</strong>
            <span>{story.impact.label}</span>
          </p>
          <p>{story.cause}</p>
          <p className="guardrail"><b>Guardrail</b>{story.guardrail}</p>
          {story.source && (
            <a className="story-src" href={story.source} target="_blank" rel="noreferrer">
              Read the official report<span className="sr-only"> on {story.title} (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function Scene({ id, mode, playing }: { id: Disaster["id"]; mode: Mode; playing: boolean }) {
  const cls = `scene scene-${id} ${playing ? "playing" : ""}`;
  if (id === "knight-capital") return <KnightScene className={cls} mode={mode} playing={playing} />;
  if (id === "gitlab-db1") return <GitlabScene className={cls} mode={mode} />;
  return <HawaiiScene className={cls} mode={mode} />;
}

/* ---------- Knight Capital: eight servers, one running old code, losses climbing ---------- */

const KNIGHT = {
  real: { lossM: 440, minutes: 45, ms: 6000, ease: 2.2 },
  guarded: { lossM: 1, minutes: 1, ms: 1400, ease: 1 },
};

function KnightScene({ className, mode, playing }: { className: string; mode: Mode; playing: boolean }) {
  const target = KNIGHT[mode];
  const [p, setP] = useState(0);

  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setP(1));
      return () => cancelAnimationFrame(id);
    }
    const startAt = performance.now() + 1300;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / target.ms));
      setP(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, target.ms]);

  const loss = target.lossM * Math.pow(p, target.ease);
  const minute = Math.round(target.minutes * p);
  const clock = `${9 + Math.floor((30 + minute) / 60)}:${String((30 + minute) % 60).padStart(2, "0")}`;
  const done = p >= 1;

  return (
    <div className={className}>
      <p className="sr-only">
        {mode === "real"
          ? "Animation: one of eight servers runs old code and floods the market with orders. Losses climb to 440 million dollars over 45 minutes."
          : "Animation: the same server starts sending orders, losses pass a 1 million dollar limit within a minute, and a circuit breaker halts trading."}
      </p>
      <div className="k-head" aria-hidden="true">
        <span>Order router, market open</span>
        <span className="k-clock">{clock}</span>
      </div>
      <div className="k-body" aria-hidden="true">
        <div className="k-servers">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`k-server ${i === 7 ? "rogue" : ""}`}>
              <span>{i === 7 ? "Server 8, old code" : `Server ${i + 1}`}</span>
            </div>
          ))}
        </div>
        <div className={`k-stream ${mode === "guarded" && done ? "stopped" : ""}`}>
          {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ["--d" as string]: `${(i * 0.17).toFixed(2)}s`, ["--y" as string]: `${(i * 37) % 100}%` }} />)}
        </div>
        <div className="k-meter">
          <span className="k-label">Loss</span>
          <span className="k-loss">${loss < 10 ? loss.toFixed(1) : Math.round(loss)}M</span>
          <span className="k-sub">{mode === "real" ? (done ? "45 minutes. Over 4 million trades." : "and climbing") : "limit $1M"}</span>
        </div>
      </div>
      {mode === "guarded" && done && (
        <div className="verdict v-held" aria-hidden="true">
          <b>Circuit breaker tripped</b>
          <span>Loss passed $1M in the first minute. Trading halted, server 8 isolated.</span>
        </div>
      )}
      {mode === "real" && done && (
        <div className="verdict v-lost" aria-hidden="true">
          <b>$440M lost</b>
          <span>Nothing stopped it. Knight needed a rescue the same week.</span>
        </div>
      )}
    </div>
  );
}

/* ---------- GitLab: a delete typed on the wrong host ---------- */

const BACKUPS = [
  ["pg_dump backups", "failing silently"],
  ["Disk snapshots", "not enabled"],
  ["Backups to S3", "bucket empty"],
  ["Replica db2", "out of sync"],
  ["Manual snapshot", "6 hours old"],
];

function GitlabScene({ className, mode }: { className: string; mode: Mode }) {
  return (
    <div className={className}>
      <p className="sr-only">
        {mode === "real"
          ? "Animation: on the primary database host db1, rm -rf deletes the data directory. 300 gigabytes drop to zero, then five backup methods are checked and none is current."
          : "Animation: the same rm -rf is typed on db1, and Tripwire holds it for approval with a risk of 0.95. The data stays."}
      </p>
      <div className="term" aria-hidden="true">
        <div className="term-bar"><i /><i /><i /><span>db1.cluster.gitlab.com</span></div>
        <div className="term-body">
          <div className="term-line">
            <span className="term-prompt">db1$</span>
            <span className="type">rm -rf /var/opt/gitlab/postgresql/data</span>
          </div>
          <div className="disk">
            <span className="disk-name">PostgreSQL data on db1 (primary)</span>
            <div className="disk-bar"><div /></div>
            <span className="disk-size"><b className="full">300 GB</b><b className="empty">0 B</b></span>
          </div>
          {mode === "real" ? (
            <ul className="backups">
              {BACKUPS.map(([name, state], i) => (
                <li key={name} style={{ ["--n" as string]: i }}>
                  <span>{name}</span>
                  <span className={i === 4 ? "warn" : "bad"}>{state}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hold-card">
              <b>Held for approval</b>
              <code>rm -rf on db1</code>
              <span>Risk 0.95, destructive filesystem command. The approver sees db1 is the primary and denies it.</span>
            </div>
          )}
        </div>
      </div>
      {mode === "real" ? (
        <div className="verdict v-lost late" aria-hidden="true">
          <b>About 6 hours of data lost</b>
          <span>Restored from the one copy that existed.</span>
        </div>
      ) : (
        <div className="verdict v-held late" aria-hidden="true">
          <b>Denied. Nothing deleted.</b>
          <span>The engineer reruns it on db2.</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Hawaii: the live alert picked from the same list as the drill ---------- */

function HawaiiScene({ className, mode }: { className: string; mode: Mode }) {
  return (
    <div className={className}>
      <p className="sr-only">
        {mode === "real"
          ? "Animation: an operator picks the live missile alert instead of the test from the same list, confirms, and every phone in Hawaii shows the alert. The correction comes 38 minutes later."
          : "Animation: the operator picks the live alert, and the send is held until a second approver checks it. The phones stay quiet."}
      </p>
      <div className="h-body" aria-hidden="true">
        <div className="h-console">
          <span className="h-title">Alert console, 8:07 a.m.</span>
          <ul className="h-menu">
            <li className="opt-test">Missile alert, test</li>
            <li className="opt-live">Missile alert, live</li>
            <li>Amber alert, test</li>
          </ul>
          <div className="h-confirm">
            <span>Are you sure you want to send this alert?</span>
            <span className="h-yes">Yes</span>
          </div>
        </div>
        <div className="h-phone">
          <div className="h-notch" />
          {mode === "real" ? (
            <div className="h-alert">
              <b>Emergency alert</b>
              <span>BALLISTIC MISSILE THREAT INBOUND TO HAWAII. SEEK IMMEDIATE SHELTER. THIS IS NOT A DRILL.</span>
            </div>
          ) : (
            <div className="h-quiet">No alerts</div>
          )}
        </div>
      </div>
      {mode === "real" ? (
        <div className="verdict v-lost late" aria-hidden="true">
          <b>8:45 a.m. Correction sent</b>
          <span>38 minutes of a whole state taking shelter.</span>
        </div>
      ) : (
        <div className="verdict v-held mid" aria-hidden="true">
          <b>Held for a second approver</b>
          <span>A live statewide alert needs two people. The second sees it is a drill.</span>
        </div>
      )}
    </div>
  );
}
