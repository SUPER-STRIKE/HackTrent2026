# Tripwire

A flight recorder and seatbelt for AI agents.

Agents send every action they take to Tripwire. Gemini scores each action's risk. Risky actions pause until a human approves them with MFA. Every event is logged and charted live.

## How it works

| Piece | Tool | Role |
|-------|------|------|
| Login, agent tokens, step-up MFA | Auth0 | Humans sign in; agents get M2M tokens; approvals require MFA |
| Event storage and live charts | Tiger Data (Timescale) | Hypertable of agent events, continuous aggregates for the dashboard |
| Risk scoring and analysis | Gemini | Scores each action, powers the Investigator chat, incident summaries and similar-incident search |
| Hosting | Vercel + GoDaddy DNS | Deployed on Vercel at a custom domain |

Pages:

- `/dashboard`: live volume chart, risk trace, event stream
- `/approvals`: queue of held actions; approve with MFA or deny
- `/incidents`: Gemini summaries and similar incidents
- `/investigator`: ask questions about what agents did

## Getting started

Requires Node.js 20+ and a Tiger Data database.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:migrate           # create the schema
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See [`.env.example`](.env.example) for the full list. The main groups are:

- **Auth0**: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `AUTH0_AUDIENCE`, `AUTH0_AGENT_CLIENT_IDS`, `APPROVER_EMAILS`
- **Database**: `DATABASE_URL` (and optional `DATABASE_CA`)
- **Gemini**: `GEMINI_API_KEY`, optional `GEMINI_MODEL` and `RISK_THRESHOLD` (default 0.7). Set `RISK_MODEL=off` to score with built-in rules and policies only (no Gemini call, so no quota use and identical results every run); the Investigator and incident summaries still use Gemini
- **Demo mode**: `DEMO_MODE`, `DEMO_INTERVAL_SECONDS`

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply `db/schema.sql` |
| `npm run db:seed` | Replace demo rows with the fixed demo cases |
| `npm run demo` | Seed, then stream live demo events |
| `npm run simulate` | Run the agent simulator (needs an Auth0 M2M app in `.env.local`) |
| `npm run traffic` | Send steady background traffic |
| `npm run lint` | Run ESLint |
| `npm test` | Unit tests for scoring and the SDK |

## Agent SDK

Agents report every action to Tripwire before running it. Low-risk actions run at once, risky ones wait for a human with MFA, denied ones never run.

```js
import { Tripwire } from "./sdk/tripwire.mjs";
const tw = new Tripwire({ baseUrl, auth0Domain, audience, clientId, clientSecret, agentName: "billing-bot", failMode: "closed" });
await tw.guard({ sessionId, actionType: "refund", target: "order-42", payload: { amount: 90 } }, () => refund(42));
```

```python
from tripwire import Tripwire, guard   # sdk/python, standard library only
tw = Tripwire(base_url=..., auth0_domain=..., audience=..., client_id=..., client_secret=..., agent_name="billing-bot")

@guard(tw, session_id="run-42", action_type="refund")
def refund(order_id, amount): ...
```

**Safety modes** decide what happens if Tripwire cannot be reached (after retries with backoff):

| `failMode` | Behavior |
| --- | --- |
| `closed` (default) | The action does not run. |
| `allowlist` | Runs only if its action type is in `offlineAllow`; everything else is blocked. |
| `open` | The action runs. Only for low-stakes agents. |

`open` and `allowlist` apply only when the request provably never reached Tripwire (connection refused, DNS failure, token endpoint down, 429). After a timeout or a 5xx the action may already be held for a human, so it is blocked in every mode. An action already waiting for a human is never let through, and bad credentials or a rejected request are never treated as an outage. Payloads are shortened to fit the 64KB ingest limit instead of being rejected.

**Framework adapters** (`sdk/adapters`)

| Adapter | Use |
| --- | --- |
| `tools.mjs` | `wrapTools(tw, { sessionId }, tools)` guards tools that expose `execute` (Vercel AI SDK), `func` (LangChain JS) or `invoke`. |
| `mcp-proxy.mjs` | `node sdk/adapters/mcp-proxy.mjs -- <any stdio MCP server command>` guards every `tools/call` with no code changes. |
| `claude-code-hook.mjs` | A Claude Code `PreToolUse` hook. Add it under `hooks.PreToolUse` in `.claude/settings.json` with a long `timeout`. |

The command-line adapters read `TRIPWIRE_URL`, `TRIPWIRE_AUTH0_DOMAIN`, `TRIPWIRE_AUDIENCE`, `TRIPWIRE_CLIENT_ID`, `TRIPWIRE_CLIENT_SECRET`, and optionally `TRIPWIRE_FAIL_MODE` and `TRIPWIRE_OFFLINE_ALLOW`.

## How an action is scored

1. **Policies** (your own rules, `/policies`): a `deny` rule blocks at once with no model call; `require_approval` always holds.
2. **Built-in rules + Gemini**: the higher of the two. Rules are a floor the model cannot talk down.
3. **Baseline**: with at least 20 events of history, a first-ever action type for the agent adds 0.15 and an activity spike adds 0.10.
4. **Feedback**: past human decisions on the same action type, target and payload. A denial adds 0.10; three or more approvals and no denial subtracts 0.15. Critical built-in rules, `require_approval` policies and holds caused by a Gemini outage are never relaxed.
5. An `allow` policy caps a non-critical score just under the threshold. Because the agent writes its own text, allow rules can only match the whole action type or target, never free text. Patterns with repeated groups that contain repeats or alternatives, and backreferences, are rejected.

Every action stores the factors behind its score, shown as "Why this score" on Approvals and on each incident. Policies that loosen protection (`allow`, or turning off/deleting `deny` and `require_approval`) need a fresh MFA check.

Apply the schema change with `npm run db:migrate` (adds `policy_rules` and `agent_events.risk_factors`). `npm test` runs the unit tests.

## Demo

The demo uses 10 fixed cases (`db/demo-data.mjs`), so it plays the same way every time. See [DEMO.md](DEMO.md) for the case list and the 3-minute walkthrough.

To run it with no terminal commands, set `DEMO_MODE=1` and the app seeds itself and replays the cases every `DEMO_INTERVAL_SECONDS`.

## Project docs

- [DEMO.md](DEMO.md): demo script
