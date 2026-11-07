export type FailMode = "closed" | "allowlist" | "open";

export interface TripwireOptions {
  baseUrl: string;
  auth0Domain?: string;
  /** Overrides the Auth0 token endpoint (testing, custom domains). */
  tokenUrl?: string;
  audience: string;
  clientId: string;
  clientSecret: string;
  agentName?: string;
  /** What to do when Tripwire cannot be reached. Default "closed". */
  failMode?: FailMode;
  /** Action types allowed while Tripwire is unreachable when failMode is "allowlist". */
  offlineAllow?: (string | RegExp)[];
  /** Per-request timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Retries for network errors, 5xx and 429. Default 2. */
  retries?: number;
  onFailMode?: (info: { action: Action; mode: FailMode; allowed: boolean; error: Error }) => void;
  fetchImpl?: typeof fetch;
}

export interface Action {
  sessionId: string;
  actionType: string;
  target?: string;
  payload?: Record<string, unknown>;
}

export interface RiskFactor {
  kind: "rule" | "model" | "baseline" | "history" | "policy";
  label: string;
  score?: number;
  delta?: number;
}

export interface Risk {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  reason: string;
  source: string;
  factors: RiskFactor[];
}

export interface ReportResult {
  event_id: string;
  time: string;
  status: "allowed" | "pending" | "denied";
  risk: Risk;
}

export interface Decision {
  status: string;
  proceed: boolean;
  event_id?: string;
}

export interface GuardOptions {
  failMode?: FailMode;
  timeoutMs?: number;
  onReport?: (r: ReportResult) => void;
  onWait?: (d: Decision) => void;
}

export class TripwireDenied extends Error {
  decision: unknown;
}
export class TripwireUnavailable extends Error {}
export class TripwireError extends Error {
  status: number;
}

export class Tripwire {
  constructor(options: TripwireOptions);
  report(action: Action): Promise<ReportResult>;
  waitForDecision(eventId: string, opts?: { timeoutMs?: number; onWait?: (d: Decision) => void }): Promise<Decision>;
  guard<T>(action: Action, fn: (r: Partial<ReportResult> & { offline?: boolean }) => T | Promise<T>, opts?: GuardOptions): Promise<T>;
}
