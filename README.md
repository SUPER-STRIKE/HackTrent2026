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
- **Gemini**: `GEMINI_API_KEY`, optional `GEMINI_MODEL` and `RISK_THRESHOLD` (default 0.7)
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

## Agent SDK

`sdk/tripwire.mjs` is a small client that agents use to send actions to Tripwire before running them and to wait for approval when an action is held.

## Demo

The demo uses 10 fixed cases (`db/demo-data.mjs`), so it plays the same way every time. See [DEMO.md](DEMO.md) for the case list and the 3-minute walkthrough.

To run it with no terminal commands, set `DEMO_MODE=1` and the app seeds itself and replays the cases every `DEMO_INTERVAL_SECONDS`.

## Project docs

- [DEMO.md](DEMO.md): demo script
