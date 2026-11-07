// Tripwire agent SDK. Zero dependencies, Node 18+.
//
//   const tw = new Tripwire({ baseUrl, auth0Domain, audience, clientId, clientSecret, agentName });
//   const result = await tw.guard({ sessionId, actionType: "shell.exec", target: "ls", payload: {} }, () => run());
//
// guard() reports the action first. Low-risk actions run at once. Risky ones wait for a human
// (approve with MFA in the Tripwire app). Denied or timed-out actions never run.

export class TripwireDenied extends Error {
  constructor(message, decision) {
    super(message);
    this.name = "TripwireDenied";
    this.decision = decision;
  }
}

export class Tripwire {
  constructor({ baseUrl, auth0Domain, audience, clientId, clientSecret, agentName, fetchImpl = fetch }) {
    for (const [k, v] of Object.entries({ baseUrl, auth0Domain, audience, clientId, clientSecret }))
      if (!v) throw new Error(`Tripwire: ${k} is required`);
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.tokenUrl = `https://${auth0Domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/oauth/token`;
    Object.assign(this, { audience, clientId, clientSecret, agentName, fetchImpl });
    this.token = null;
    this.tokenExpiry = 0;
  }

  async #accessToken() {
    if (this.token && Date.now() < this.tokenExpiry - 30_000) return this.token;
    const res = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: this.clientId, client_secret: this.clientSecret, audience: this.audience }),
    });
    if (!res.ok) throw new Error(`Tripwire: Auth0 token request failed (${res.status})`);
    const data = await res.json();
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.token;
  }

  async #call(path, init = {}) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${await this.#accessToken()}`, "content-type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Tripwire: ${path} failed (${res.status}) ${body.error ?? ""}`.trim());
    return body;
  }

  /** Reports an action. Returns { event_id, status: "allowed" | "pending", risk }. */
  report({ sessionId, actionType, target, payload }) {
    return this.#call("/api/ingest", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, action_type: actionType, target, payload, agent_name: this.agentName }),
    });
  }

  /** Waits until a pending action is decided. Resolves { status, proceed, ... }. */
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

  /** Reports the action, waits if it is held, then runs fn only when allowed. Throws TripwireDenied otherwise. */
  async guard(action, fn, opts = {}) {
    let r = await this.report(action);
    opts.onReport?.(r);
    if (r.status === "pending") {
      const d = await this.waitForDecision(r.event_id, opts);
      if (!d.proceed) throw new TripwireDenied(`Action ${action.actionType} was ${d.status}`, d);
      r = { ...r, status: d.status };
    }
    return fn(r);
  }
}
