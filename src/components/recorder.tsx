/**
 * The intro animation: a recorder pen draws normal agent activity, then a destructive
 * action spikes through the tripwire and the pen stops there, held for approval.
 * Pure SVG + CSS (plus one SMIL motion for the pen tip), so it costs no client JS.
 */

const W = 1000;
const H = 300;
const THRESHOLD = 0.7;
const STOP_X = 820;
const DURATION_S = 3.4;

const y = (risk: number) => H - 12 - risk * (H - 30);

// Events the pen passes, taken from the demo scenario.
const MARKS = [
  { x: 90, risk: 0.2, label: "fs.read README.md", hideSm: true },
  { x: 210, risk: 0.26, label: "shell.exec npm test", hideSm: true },
  { x: 330, risk: 0.45, label: "send_email 1 recipient", hideSm: false },
  { x: 625, risk: 0.22, label: "db.query SELECT count(*)", hideSm: true },
];

/** Small deterministic jitter so the trace looks like a real pen and renders the same every time. */
function noise(i: number) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildPoints() {
  const pts: { x: number; r: number }[] = [];
  for (let x = 0; x <= 760; x += 12) {
    let r = 0.05 + noise(x) * 0.09;
    for (const m of MARKS) {
      const d = Math.abs(x - m.x);
      if (d < 30) r = Math.max(r, m.risk * (1 - d / 34));
    }
    pts.push({ x, r });
  }
  pts.push({ x: 778, r: 0.16 }, { x: 792, r: 0.34 }, { x: 806, r: 0.71 }, { x: STOP_X, r: 0.97 });
  return pts.map((p) => ({ x: p.x, y: y(p.r) }));
}

const POINTS = buildPoints();
const D = POINTS.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/** Fraction of the path length at which the pen reaches x, so labels appear as it passes. */
function lengthAt(x: number) {
  let total = 0;
  let upTo = 0;
  for (let i = 1; i < POINTS.length; i++) {
    const seg = Math.hypot(POINTS[i].x - POINTS[i - 1].x, POINTS[i].y - POINTS[i - 1].y);
    total += seg;
    if (POINTS[i].x <= x) upTo = total;
  }
  return upTo / total;
}

const PEAK = POINTS[POINTS.length - 1];
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

export function Recorder() {
  return (
    <figure className="recorder" style={{ ["--dur" as string]: `${DURATION_S}s` }}>
      <div className="recorder-head">
        <span><i className="rec-dot" aria-hidden="true" /><b>Recording</b> deploy-bot, support-bot, data-bot</span>
        <span>Risk per action, 0 to 1</span>
      </div>
      <div className="plot strip">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Agent actions stay at low risk until db.execute DROP TABLE customers scores 0.97, crosses the 0.70 tripwire and is held for approval.">
          <line className="limit" x1={0} x2={W} y1={y(THRESHOLD)} y2={y(THRESHOLD)} vectorEffect="non-scaling-stroke" />
          <path className="trace draw" d={D} pathLength={1} vectorEffect="non-scaling-stroke" />
          <path className="peak-ring" d={`M${PEAK.x} ${PEAK.y}h0.01`} vectorEffect="non-scaling-stroke" />
          <path className="tip tip-static" d={`M${PEAK.x} ${PEAK.y}h0.01`} vectorEffect="non-scaling-stroke" />
          <path className="tip tip-moving" d="M0 0h0.01" vectorEffect="non-scaling-stroke">
            <animateMotion dur={`${DURATION_S}s`} begin="0.4s" fill="freeze" path={D} />
          </path>
        </svg>
        <span className="plot-label wire-label" style={{ top: pct(y(THRESHOLD), H) }}>Tripwire 0.70</span>
        {MARKS.map((m) => (
          <span
            key={m.label}
            className={`mark ${m.hideSm ? "hide-sm" : ""}`}
            style={{ left: pct(m.x, W), top: pct(y(m.risk), H), ["--at" as string]: lengthAt(m.x).toFixed(3) }}
            aria-hidden="true"
          >
            {m.label}
          </span>
        ))}
        <div className="held" role="note">
          <b>Held for approval</b>
          <code>db.execute DROP TABLE customers</code>
          <span>data-bot, risk 0.97. Waiting for an approver to confirm with MFA.</span>
        </div>
      </div>
    </figure>
  );
}
