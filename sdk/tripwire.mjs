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
// A Tripwire outage never lets through an action that is already waiting for a human, and a
// misconfigured agent (bad credentials, rejected request) is never treated as an outage.

export class TripwireDenied extends Error {
  constructor(message, decision) {
    super(message);
    this.name = "TripwireDenied";
    this.decision = decision;
  }
}

/** Tripwire could not be reached (network error, timeout, 5xx or 429 after retries). */
export class TripwireUnavailable extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "TripwireUnavailable";
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
  async #request(url, init) {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (err) {
      throw new TripwireUnavailable(`Tripwire: could not reach ${new URL(url).host}`, err);
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
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) this.token = null; // the token may have been revoked; fetch a new one next time
      if (isTransient(res.status)) {
        const err = new TripwireUnavailable(`Tripwire: ${path} failed (${res.status})`);
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
      body: JSON.stringify({ session_id: sessionId, action_type: actionType, target, payload, agent_name: this.agentName }),
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
      const allowed = this.#offlineDecision(action, mode);
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
