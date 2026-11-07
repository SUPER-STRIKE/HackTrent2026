// Tripwire agent SDK. Zero dependencies, Node 18+.
//
//   const tw = new Tripwire({ baseUrl, auth0Domain, audience, clientId, clientSecret, agentName });
//   const result = await tw.guard({ sessionId, actionType: "shell.exec", target: "ls", payload: {} }, () => run());
//
// guard() reports the action first. Low-risk actions run at once. Risky ones wait for a human
// (approve with MFA in the Tripwire app). Denied or timed-out actions never run.
//
// Safety modes (what happens when Tripwire cannot be reached, after retries):
//   failMode: "closed"     (default) the action does not run.
//   failMode: "allowlist"  runs only if actionType matches `offlineAllow` (strings or RegExps), else blocked.
//   failMode: "open"       the action runs. Use only for low-stakes agents.
// open and allowlist apply only when the request provably never reached Tripwire (connection refused, DNS
// failure, token endpoint down, 429). After a timeout or a 5xx the action may already be held for a human,
// so it is blocked in every mode.
// A Tripwire outage never lets through an action that is already waiting for a human, and a
// misconfigured agent (bad credentials, rejected request) is never treated as an outage.

export class TripwireDenied extends Error {
  constructor(message, decision) {
    super(message);
    this.name = "TripwireDenied";
    this.decision = decision;
  }
}

/**
 * Tripwire could not be reached (network error, timeout, 5xx or 429 after retries).
 * `ambiguous` is true when the request may have reached the server (a timeout, a reset, a 5xx), so the
 * action may already be recorded and held. Ambiguous failures never fail open.
 */
export class TripwireUnavailable extends Error {
  constructor(message, cause, ambiguous = false) {
    super(message, { cause });
    this.name = "TripwireUnavailable";
    this.ambiguous = ambiguous;
  }
}

/** Tripwire answered, but refused or misunderstood the request (bad credentials, invalid body). */
export class TripwireError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TripwireError";
    this.status = status;
  }
}

// Errors that prove the request never reached the server.
const NOT_DELIVERED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);
const neverReached = (err) => {
  const codes = [err?.cause?.code, ...(err?.cause?.errors ?? []).map((e) => e.code)];
  return codes.length > 0 && codes.every((c) => NOT_DELIVERED.has(c));
};

const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_STRING = 2000;

/** JSON-safe copy of a payload that fits the server's body limit: long strings and cycles are shortened. */
export function boundPayload(payload) {
  const seen = new WeakSet();
  let json;
  try {
    json = JSON.stringify(payload ?? {}, (_k, v) => {
      if (typeof v === "string" && v.length > MAX_STRING) return `${v.slice(0, MAX_STRING)}...[truncated ${v.length - MAX_STRING} chars]`;
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[circular]";
        seen.add(v);
      }
      return v;
    });
  } catch {
    return { _unserializable: true };
  }
  if (json === undefined || json.length <= MAX_PAYLOAD_BYTES) return json === undefined ? {} : JSON.parse(json);
  return { _truncated: true, preview: json.slice(0, MAX_PAYLOAD_BYTES / 2) };
}

const FAIL_MODES = ["closed", "allowlist", "open"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTransient = (status) => status === 429 || status >= 500;

export class Tripwire {
  constructor({
    baseUrl, auth0Domain, audience, clientId, clientSecret, agentName,
    tokenUrl, failMode = "closed", offlineAllow = [], timeoutMs = 10_000, retries = 2, onFailMode, fetchImpl = fetch,
  }) {
    for (const [k, v] of Object.entries({ baseUrl, audience, clientId, clientSecret }))
      if (!v) throw new Error(`Tripwire: ${k} is required`);
    if (!tokenUrl && !auth0Domain) throw new Error("Tripwire: auth0Domain is required");
    if (!FAIL_MODES.includes(failMode)) throw new Error(`Tripwire: failMode must be one of ${FAIL_MODES.join(", ")}`);
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.tokenUrl = tokenUrl ?? `https://${auth0Domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/oauth/token`;
    Object.assign(this, { audience, clientId, clientSecret, agentName, failMode, offlineAllow, timeoutMs, retries, onFailMode, fetchImpl });
    this.token = null;
    this.tokenExpiry = 0;
  }

  /** One HTTP attempt with a timeout. Network failures and timeouts become TripwireUnavailable. */
  async #request(url, init, { recordsAction = false } = {}) {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      // Only a request that records an action can leave one behind, and only if it may have been delivered.
      throw new TripwireUnavailable(`Tripwire: could not reach ${new URL(url).host}`, err, recordsAction && !neverReached(err));
    }
  }

  /** Retries transient failures with backoff, honoring Retry-After. */
  async #withRetry(run) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (err) {
        if (!(err instanceof TripwireUnavailable) || attempt >= this.retries) throw err;
        await sleep(err.retryAfterMs ?? Math.min(2000, 200 * 2 ** attempt));
      }
    }
  }

  async #accessToken() {
    if (this.token && Date.now() < this.tokenExpiry - 30_000) return this.token;
    const data = await this.#withRetry(async () => {
      const res = await this.#request(this.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "client_credentials", client_id: this.clientId, client_secret: this.clientSecret, audience: this.audience }),
      });
      if (isTransient(res.status)) throw new TripwireUnavailable(`Tripwire: Auth0 token request failed (${res.status})`);
      if (!res.ok) throw new TripwireError(`Tripwire: Auth0 rejected the agent credentials (${res.status})`, res.status);
      return res.json();
    });
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.token;
  }

  async #call(path, init = {}) {
    return this.#withRetry(async () => {
      const res = await this.#request(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${await this.#accessToken()}`, "content-type": "application/json" },
      }, { recordsAction: init.method === "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) this.token = null; // the token may have been revoked; fetch a new one next time
      if (isTransient(res.status)) {
        // 429 is refused before anything is recorded; any other 5xx may have happened after the insert.
        const err = new TripwireUnavailable(`Tripwire: ${path} failed (${res.status})`, undefined, init.method === "POST" && res.status !== 429);
        const ra = Number(res.headers?.get?.("retry-after"));
        if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = Math.min(ra, 30) * 1000;
        throw err;
      }
      if (!res.ok) throw new TripwireError(`Tripwire: ${path} failed (${res.status}) ${body.error ?? ""}`.trim(), res.status);
      return body;
    });
  }

  /** Reports an action. Returns { event_id, status: "allowed" | "pending" | "denied", risk }. */
  report({ sessionId, actionType, target, payload }) {
    return this.#call("/api/ingest", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, action_type: actionType, target, payload: boundPayload(payload), agent_name: this.agentName }),
    });
  }

  /** Waits until a pending action is decided. Resolves { status, proceed, ... }. Never fails open. */
  async waitForDecision(eventId, { timeoutMs = 10 * 60_000, onWait } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) return { status: "timeout", proceed: false };
      const d = await this.#call(`/api/actions/${eventId}?wait=${Math.min(25, Math.ceil(left / 1000))}`);
      if (d.status !== "pending") return d;
      onWait?.(d);
    }
  }

  /** What the configured safety mode says to do when the action could not be reported. */
  #offlineDecision(action, mode) {
    if (mode === "open") return true;
    if (mode === "allowlist")
      return this.offlineAllow.some((p) => (p instanceof RegExp ? p.test(action.actionType) : p === action.actionType));
    return false;
  }

  /**
   * Reports the action, waits if it is held, then runs fn only when allowed.
   * Throws TripwireDenied when a human or a policy said no, TripwireUnavailable when Tripwire could not
   * be reached and the safety mode does not allow the action. `opts.failMode` overrides the default per call.
   */
  async guard(action, fn, opts = {}) {
    let r;
    try {
      r = await this.report(action);
    } catch (err) {
      if (!(err instanceof TripwireUnavailable)) throw err;
      const mode = opts.failMode ?? this.failMode;
      // If the request may have arrived, the action could already be held for a human: never run it.
      const allowed = !err.ambiguous && this.#offlineDecision(action, mode);
      this.onFailMode?.({ action, mode, allowed, error: err });
      if (!allowed) throw err;
      return fn({ event_id: null, status: "unrecorded", offline: true });
    }
    opts.onReport?.(r);
    if (r.status === "denied") throw new TripwireDenied(`Action ${action.actionType} was denied: ${r.risk?.reason ?? "blocked by policy"}`, r);
    if (r.status === "pending") {
      const d = await this.waitForDecision(r.event_id, opts);
      if (!d.proceed) throw new TripwireDenied(`Action ${action.actionType} was ${d.status}`, d);
      r = { ...r, status: d.status };
    }
    return fn(r);
  }
}
